import { api, ApiError, clearTokens, restoreSession, saveTokens, setApiLanguage, setSessionExpiredHandler } from '../client';

// In-memory stand-in for the Keychain/Keystore.
let mockStored: string | null = null;
jest.mock('@/auth/token-storage', () => ({
  tokenStorage: {
    getRefreshToken: jest.fn(async () => mockStored),
    setRefreshToken: jest.fn(async (t: string) => {
      mockStored = t;
    }),
    clear: jest.fn(async () => {
      mockStored = null;
    }),
  },
}));

type Reply = { status?: number; body?: unknown } | 'network-error';
const json = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

/** Route-based fake server: each call to a path pops the next scripted reply. */
function fakeServer(script: Record<string, Reply[]>) {
  const calls: { path: string; auth?: string }[] = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ path, auth: headers.Authorization });
    const reply = script[path]?.shift();
    if (!reply) throw new Error(`unscripted call to ${path}`);
    if (reply === 'network-error') throw new TypeError('Network request failed');
    return json(reply.status ?? 200, reply.body);
  }) as jest.Mock;
  return calls;
}

const tokens = (n: number) => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  token_type: 'bearer',
  expires_in: 900,
});

let expired: jest.Mock;
beforeEach(async () => {
  await clearTokens();
  await saveTokens(tokens(1));
  expired = jest.fn();
  setSessionExpiredHandler(expired);
});

describe('api client', () => {
  it('sends the access token', async () => {
    const calls = fakeServer({ '/accounts': [{ body: [] }] });
    await api('/accounts');
    expect(calls[0].auth).toBe('Bearer access-1');
  });

  it('does not send a token when auth is false', async () => {
    const calls = fakeServer({ '/auth/login': [{ body: tokens(2) }] });
    await api('/auth/login', { method: 'POST', auth: false, body: {} });
    expect(calls[0].auth).toBeUndefined();
  });

  it('on 401 refreshes once, stores the rotated token, and retries the request', async () => {
    const calls = fakeServer({
      '/accounts': [{ status: 401 }, { body: ['ok'] }],
      '/auth/refresh': [{ body: tokens(2) }],
    });
    await expect(api('/accounts')).resolves.toEqual(['ok']);
    expect(calls.map((c) => c.path)).toEqual(['/accounts', '/auth/refresh', '/accounts']);
    expect(calls[2].auth).toBe('Bearer access-2'); // retried with the NEW token
    expect(mockStored).toBe('refresh-2'); // rotated token persisted
    expect(expired).not.toHaveBeenCalled();
  });

  it('shares ONE refresh between simultaneous 401s (server treats a reused token as theft)', async () => {
    const calls = fakeServer({
      '/a': [{ status: 401 }, { body: 'a' }],
      '/b': [{ status: 401 }, { body: 'b' }],
      '/c': [{ status: 401 }, { body: 'c' }],
      '/auth/refresh': [{ body: tokens(2) }], // only ONE scripted: a second call would throw
    });
    await expect(Promise.all([api('/a'), api('/b'), api('/c')])).resolves.toEqual(['a', 'b', 'c']);
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
  });

  it('ends the session when the server rejects the refresh token', async () => {
    fakeServer({ '/accounts': [{ status: 401 }], '/auth/refresh': [{ status: 401 }] });
    await expect(api('/accounts')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(mockStored).toBeNull();
  });

  it('keeps the session when the network drops during refresh', async () => {
    fakeServer({ '/accounts': [{ status: 401 }], '/auth/refresh': ['network-error'] });
    await expect(api('/accounts')).rejects.toMatchObject({ status: 0 });
    expect(expired).not.toHaveBeenCalled();
    expect(mockStored).toBe('refresh-1'); // still logged in; will retry later
  });

  it('retries only once: a second 401 after refreshing is an error, not a loop', async () => {
    const calls = fakeServer({
      '/accounts': [{ status: 401 }, { status: 401, body: { detail: 'nope' } }],
      '/auth/refresh': [{ body: tokens(2) }],
    });
    await expect(api('/accounts')).rejects.toMatchObject({ status: 401, message: 'nope' });
    expect(calls).toHaveLength(3);
  });

  it('turns a network failure into ApiError(0)', async () => {
    fakeServer({ '/accounts': ['network-error'] });
    await expect(api('/accounts')).rejects.toMatchObject({ status: 0 });
  });

  it('shows FastAPI string errors and validation errors readably', async () => {
    fakeServer({
      '/x': [{ status: 409, body: { detail: 'Email already registered' } }],
      '/y': [
        {
          status: 422,
          body: { detail: [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters' }] },
        },
      ],
    });
    await expect(api('/x', { auth: false })).rejects.toThrow('Email already registered');
    await expect(api('/y', { auth: false })).rejects.toThrow('password: String should have at least 8 characters');
  });

  it('restoreSession is false with no mockStored token and makes no request', async () => {
    await clearTokens();
    const calls = fakeServer({});
    await expect(restoreSession()).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('returns undefined for 204 responses', async () => {
    fakeServer({ '/logout': [{ status: 204 }] });
    await expect(api('/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('carries the machine-readable error code so screens can react to it', async () => {
    fakeServer({ '/transfers': [{ status: 428, body: { detail: 'We sent a code', code: 'otp_required' } }] });
    await expect(api('/transfers', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 428,
      code: 'otp_required',
      message: 'We sent a code',
    });
  });

  it('a wrong PIN (403) does NOT trigger a token refresh', async () => {
    const calls = fakeServer({ '/transfers': [{ status: 403, body: { detail: 'Incorrect PIN.', code: 'pin_invalid' } }] });
    await expect(api('/transfers', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'pin_invalid' });
    expect(calls.map((c) => c.path)).toEqual(['/transfers']); // no /auth/refresh
  });

  it("can fetch a plain-text body (e.g. a CSV statement), still sending the token", async () => {
    let auth: string | undefined;
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      auth = (init?.headers as Record<string, string>).Authorization;
      return { status: 200, ok: true, text: async () => 'Date,Amount\r\n2026-10-29,-12.50' } as Response;
    }) as jest.Mock;
    await expect(api<string>('/accounts/x/statement.csv', { responseType: 'text' })).resolves.toBe('Date,Amount\r\n2026-10-29,-12.50');
    expect(auth).toBe('Bearer access-1');
  });

  it('tells the server which language the user chose (it writes the SMS in it)', async () => {
    const seen: (string | undefined)[] = [];
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>)['Accept-Language']);
      return { status: 200, ok: true, json: async () => ({}) } as Response;
    }) as jest.Mock;
    await api('/accounts');
    setApiLanguage('fa');
    await api('/accounts');
    setApiLanguage('en');
    expect(seen).toEqual(['en', 'fa']);
  });

  it('carries the parameters the app needs to build a translated sentence', async () => {
    fakeServer({ '/transfers': [{ status: 403, body: { detail: 'x', code: 'pin_invalid', params: { left: 3 } } }] });
    await expect(api('/transfers', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'pin_invalid', params: { left: 3 } });
  });

  it('exposes ApiError instances', async () => {
    fakeServer({ '/x': [{ status: 500, body: {} }] });
    await expect(api('/x')).rejects.toBeInstanceOf(ApiError);
  });
});

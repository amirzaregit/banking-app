import { API_URL } from '@/config';
import { tokenStorage } from '@/auth/token-storage';
import type { TokenResponse } from './types';

export class ApiError extends Error {
  constructor(
    public status: number, // 0 = could not reach the server at all
    message: string,
    public code?: string, // stable machine-readable name from the server, e.g. "pin_locked"
    public params?: Record<string, string | number | null>, // numbers for the translated sentence, e.g. {left: 4}
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---- module state -------------------------------------------------------------------

let accessToken: string | null = null; // memory only
let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: () => void = () => {};
let language = 'en';

/** The language the user chose. Sent as Accept-Language so the SERVER writes texts it must produce itself (the SMS) in it. */
export function setApiLanguage(lang: string) {
  language = lang;
}

/** The session provider registers what should happen when the server rejects our login. */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export async function saveTokens(tokens: TokenResponse) {
  // Store the NEW refresh token first: the server has already invalidated the old one.
  await tokenStorage.setRefreshToken(tokens.refresh_token);
  accessToken = tokens.access_token;
}

export async function clearTokens() {
  accessToken = null;
  await tokenStorage.clear();
}

// ---- errors -------------------------------------------------------------------------

/** FastAPI sends {detail: "text"} or, for validation errors, {detail: [{msg, loc}, ...]}. */
function messageFromBody(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string; loc?: (string | number)[] };
    const field = first.loc?.filter((p) => p !== 'body').join('.');
    const msg = (first.msg ?? '').replace(/^Value error, /, '');
    return field ? `${field}: ${msg}` : msg || fallback;
  }
  return fallback;
}

function paramsFromBody(body: unknown): Record<string, string | number | null> | undefined {
  const params = (body as { params?: unknown } | null)?.params;
  return params && typeof params === 'object' ? (params as Record<string, string | number | null>) : undefined;
}

function codeFromBody(body: unknown): string | undefined {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.", 'network');
  }
}

// ---- refresh (single-flight) --------------------------------------------------------

async function doRefresh(): Promise<boolean> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) return false;

  // A network failure here THROWS (we keep the session); only a 401 means "logged out".
  const res = await send('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (res.status === 401) {
    await clearTokens();
    return false;
  }
  if (!res.ok) throw new ApiError(res.status, 'Could not refresh the session');
  await saveTokens((await res.json()) as TokenResponse);
  return true;
}

/** Everyone who needs a refresh at the same moment shares ONE request. */
function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Called on app launch: turn the stored refresh token into a working session. */
export function restoreSession(): Promise<boolean> {
  return refreshOnce();
}

// ---- requests -----------------------------------------------------------------------

type Options = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean; // default true: attach the access token and auto-refresh on 401
  responseType?: 'json' | 'text'; // 'text' for non-JSON bodies such as a CSV file
};

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true, responseType = 'json' } = options;

  const attempt = () =>
    send(path, {
      method,
      headers: {
        'Accept-Language': language,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await attempt();

  if (res.status === 401 && auth) {
    const refreshed = await refreshOnce(); // may throw ApiError(0) if offline
    if (!refreshed) {
      onSessionExpired();
      throw new ApiError(401, 'Your session has expired. Please sign in again.', 'session_expired');
    }
    res = await attempt(); // retry exactly once with the new access token
  }

  if (res.status === 204) return undefined as T;
  if (responseType === 'text' && res.ok) return (await res.text()) as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageFromBody(data, `Request failed (${res.status})`), codeFromBody(data), paramsFromBody(data));
  return data as T;
}

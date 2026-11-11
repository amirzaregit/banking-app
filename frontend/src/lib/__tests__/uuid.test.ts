import { randomUUID } from '../uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUID', () => {
  it('produces valid v4 UUIDs that do not repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = randomUUID();
      expect(id).toMatch(V4);
      seen.add(id);
    }
    expect(seen.size).toBe(500);
  });

  it('works without any crypto at all (the fallback path)', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(randomUUID()).toMatch(V4);
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });

  it('works with getRandomValues but no randomUUID (older phones)', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: (a: Uint8Array) => a.fill(7) }, configurable: true });
    try {
      expect(randomUUID()).toMatch(V4);
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});

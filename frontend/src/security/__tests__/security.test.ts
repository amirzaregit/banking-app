import { assertSecureApiUrl } from '@/config';
import { LOCK_AFTER_MS, shouldLock } from '../lock-policy';
import { checkNewPin, isCompletePin, sanitizePin } from '../pin-rules';

describe('shouldLock', () => {
  const base = { enabled: true, backgroundedAt: 1_000, now: 1_000 + LOCK_AFTER_MS };

  it('locks once the app has been away for the grace period', () => {
    expect(shouldLock(base)).toBe(true);
    expect(shouldLock({ ...base, now: base.now + 60_000 })).toBe(true);
  });
  it('does not lock for a quick glance at another app (or the fingerprint prompt itself)', () => {
    expect(shouldLock({ ...base, now: 1_000 + LOCK_AFTER_MS - 1 })).toBe(false);
    expect(shouldLock({ ...base, now: 1_000 })).toBe(false);
  });
  it('never locks when the feature is off', () => {
    expect(shouldLock({ ...base, enabled: false, now: base.now + 999_999 })).toBe(false);
  });
  it('never locks if the app was never backgrounded', () => {
    expect(shouldLock({ ...base, backgroundedAt: null })).toBe(false);
  });
  it('honours a custom grace period', () => {
    expect(shouldLock({ enabled: true, backgroundedAt: 0, now: 5_000, graceMs: 5_000 })).toBe(true);
    expect(shouldLock({ enabled: true, backgroundedAt: 0, now: 4_999, graceMs: 5_000 })).toBe(false);
  });
});

describe('PIN input rules', () => {
  it.each([
    ['482915', '482915'],
    ['48 29-15', '482915'],
    ['4829150000', '482915'],
    ['abc', ''],
  ])('sanitizePin(%j) -> %j', (input, output) => expect(sanitizePin(input)).toBe(output));

  it('accepts exactly six digits only', () => {
    expect(isCompletePin('482915')).toBe(true);
    for (const bad of ['', '12345', '1234567', '12345a', ' 12345']) expect(isCompletePin(bad)).toBe(false);
  });

  it('checkNewPin explains what is wrong', () => {
    expect(checkNewPin('482915', '482915')).toBeNull();
    expect(checkNewPin('4829', '4829')).toMatch(/exactly 6 digits/);
    expect(checkNewPin('482915', '482916')).toMatch(/do not match/);
  });
});

describe('assertSecureApiUrl', () => {
  it('allows http in development builds', () => {
    expect(assertSecureApiUrl('http://192.168.1.20:8100', true)).toBe('http://192.168.1.20:8100');
  });
  it('allows https everywhere', () => {
    expect(assertSecureApiUrl('https://api.example.com', false)).toBe('https://api.example.com');
  });
  it('REFUSES plain http in release builds', () => {
    expect(() => assertSecureApiUrl('http://api.example.com', false)).toThrow(/https/);
    expect(() => assertSecureApiUrl('http://localhost:8100', false)).toThrow(/EXPO_PUBLIC_API_URL/);
  });
});

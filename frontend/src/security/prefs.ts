import { kv } from './secure-kv';

const KEYS = { appLock: 'pref_app_lock', bioPay: 'pref_bio_pay', pin: 'bio_pay_pin' } as const;

/** Storage can fail (locked keystore, private mode): treat any failure as "off", never crash. */
async function safe<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

export const getAppLockEnabled = () => safe(async () => (await kv.get(KEYS.appLock)) === '1', false);
export const setAppLockEnabled = (on: boolean) =>
  safe(() => (on ? kv.set(KEYS.appLock, '1') : kv.remove(KEYS.appLock)), undefined);

/** "Pay with fingerprint" is only on if the flag is set AND a PIN is actually stored. */
export const getBioPayEnabled = () =>
  safe(async () => (await kv.get(KEYS.bioPay)) === '1' && (await kv.get(KEYS.pin)) !== null, false);
export const getStoredPin = () => safe(() => kv.get(KEYS.pin), null);

export const enableBioPay = (pin: string) =>
  safe(async () => {
    await kv.set(KEYS.pin, pin);
    await kv.set(KEYS.bioPay, '1');
  }, undefined);

export const disableBioPay = () =>
  safe(async () => {
    await kv.remove(KEYS.bioPay);
    await kv.remove(KEYS.pin);
  }, undefined);

/** Wipe everything on sign-out, so the next person on this phone inherits nothing. */
export const clearSecurityPrefs = () =>
  safe(async () => {
    await kv.remove(KEYS.appLock);
    await kv.remove(KEYS.bioPay);
    await kv.remove(KEYS.pin);
  }, undefined);

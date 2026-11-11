import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useI18n } from '@/i18n/provider';

import { authenticate, biometricState, failureKey, type AuthResult } from './biometrics';
import { shouldLock } from './lock-policy';
import { getAppLockEnabled, setAppLockEnabled } from './prefs';

type LockValue = {
  /** False until the saved settings are read. The app stays covered until then. */
  ready: boolean;
  enabled: boolean;
  locked: boolean;
  /** Turn fingerprint unlock on/off (needs a fingerprint either way). Returns an error message or null. */
  setEnabled: (on: boolean) => Promise<string | null>;
  /** Show the fingerprint prompt; on success the app unlocks. */
  unlock: () => Promise<AuthResult>;
};

const AppLockContext = createContext<LockValue | null>(null);

export function useAppLock(): LockValue {
  const value = useContext(AppLockContext);
  if (!value) throw new Error('useAppLock must be used inside <AppLockProvider>');
  return value;
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(true); // closed until we know better
  const enabledRef = useRef(false); // the AppState listener must see the latest value
  const backgroundedAt = useRef<number | null>(null);

  // Cold start: read the saved setting. If unlock is on, the app starts locked.
  useEffect(() => {
    let active = true;
    getAppLockEnabled().then((on) => {
      if (!active) return;
      enabledRef.current = on;
      setEnabledState(on);
      setLocked(on);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Lock again after the app has been in the background for a while.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        if (shouldLock({ enabled: enabledRef.current, backgroundedAt: backgroundedAt.current, now: Date.now() })) {
          setLocked(true);
        }
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  const setEnabled = useCallback(async (on: boolean) => {
    if (on) {
      const state = await biometricState();
      if (state === 'not-enrolled') return t('settings.fpNotEnrolled');
      if (state === 'unavailable') return t('settings.fpUnavailable');
    }
    const result = await authenticate(on ? t('lock.enablePrompt') : t('lock.disablePrompt'));
    if (!result.ok) return result.reason === 'cancelled' ? null : t(failureKey(result.reason));
    await setAppLockEnabled(on);
    enabledRef.current = on;
    setEnabledState(on);
    setLocked(false); // you just proved it's you
    return null;
  }, [t]);

  const unlock = useCallback(async () => {
    const result = await authenticate(t('lock.unlockPrompt'));
    if (result.ok) setLocked(false);
    return result;
  }, [t]);

  const value = useMemo(
    () => ({ ready, enabled, locked, setEnabled, unlock }),
    [ready, enabled, locked, setEnabled, unlock],
  );
  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

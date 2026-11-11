import * as Device from 'expo-device';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { api, clearTokens, restoreSession, saveTokens, setSessionExpiredHandler } from '@/api/client';
import type { TokenResponse, User } from '@/api/types';
import { clearSecurityPrefs } from '@/security/prefs';
import { tokenStorage } from './token-storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

type SessionValue = {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-read the profile from the server (e.g. after setting a PIN). */
  refreshUser: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

const deviceName = () => Device.deviceName ?? (Platform.OS === 'web' ? 'Web browser' : Platform.OS);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const endSession = useCallback(() => {
    clearSecurityPrefs(); // stored PIN, fingerprint settings: never survive a session
    setUser(null);
    setStatus('signedOut');
  }, []);

  // On launch: if a refresh token is stored, try to turn it into a live session.
  useEffect(() => {
    setSessionExpiredHandler(endSession);
    let cancelled = false;
    (async () => {
      try {
        if (await restoreSession()) {
          const me = await api<User>('/users/me');
          if (!cancelled) {
            setUser(me);
            setStatus('signedIn');
          }
          return;
        }
      } catch {
        // Offline or server down. The stored token is kept, so the next launch retries.
      }
      if (!cancelled) endSession();
    })();
    return () => {
      cancelled = true;
    };
  }, [endSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const tokens = await api<TokenResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: email.trim(), password, device_name: deviceName() },
    });
    await saveTokens(tokens);
    setUser(await api<User>('/users/me'));
    setStatus('signedIn');
  }, []);

  const signUp = useCallback(
    async (fullName: string, email: string, phone: string, password: string) => {
      await api<User>('/auth/register', {
        method: 'POST',
        auth: false,
        body: { full_name: fullName.trim(), email: email.trim(), phone: phone.trim(), password },
      });
      await signIn(email, password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) {
      // Best effort: tell the server so this device disappears from the device list.
      await api('/auth/logout', { method: 'POST', auth: false, body: { refresh_token: refreshToken } }).catch(
        () => {},
      );
    }
    await clearTokens();
    endSession();
  }, [endSession]);

  const refreshUser = useCallback(async () => {
    setUser(await api<User>('/users/me'));
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, refreshUser }),
    [status, user, signIn, signUp, signOut, refreshUser],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

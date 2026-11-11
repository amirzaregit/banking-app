import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import type { MessageKey } from '@/i18n';

export type BiometricState = 'ready' | 'not-enrolled' | 'unavailable';
export type AuthResult = { ok: true } | { ok: false; reason: 'cancelled' | 'lockout' | 'unavailable' | 'failed' };

/** Can this phone check a fingerprint right now? (Never on web.) */
export async function biometricState(): Promise<BiometricState> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return 'unavailable';
    return (await LocalAuthentication.isEnrolledAsync()) ? 'ready' : 'not-enrolled';
  } catch {
    return 'unavailable';
  }
}

/** Show the system fingerprint prompt. The phone's own PIN/pattern is allowed as a fallback. */
export async function authenticate(reason: string): Promise<AuthResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unavailable' };
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Cancel' });
    if (result.success) return { ok: true };
    switch (result.error) {
      case 'user_cancel':
      case 'system_cancel':
      case 'app_cancel':
      case 'user_fallback':
        return { ok: false, reason: 'cancelled' };
      case 'lockout':
        return { ok: false, reason: 'lockout' };
      case 'not_enrolled':
      case 'not_available':
      case 'passcode_not_set':
        return { ok: false, reason: 'unavailable' };
      default:
        return { ok: false, reason: 'failed' };
    }
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** Which translated sentence explains a failed fingerprint check ("cancelled" needs none). */
export function failureKey(reason: Extract<AuthResult, { ok: false }>['reason']): MessageKey {
  switch (reason) {
    case 'lockout':
      return 'lock.failLockout';
    case 'unavailable':
      return 'lock.failUnavailable';
    default:
      return 'lock.failFailed';
  }
}

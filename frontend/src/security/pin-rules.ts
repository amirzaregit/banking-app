import { normalizeDigits } from '@/i18n/digits';

export const PIN_LENGTH = 6;

/** Keep only digits, at most 6: filter keystrokes as the user types a PIN. */
export const sanitizePin = (text: string) => normalizeDigits(text).replace(/\D/g, '').slice(0, PIN_LENGTH);

export const isCompletePin = (pin: string) => /^\d{6}$/.test(pin);

/**
 * Quick local checks for instant feedback. The server remains the authority (it also rejects
 * easy-to-guess PINs like 123456).
 */
export function checkNewPin(pin: string, confirm: string): string | null {
  if (!isCompletePin(pin)) return `The PIN must be exactly ${PIN_LENGTH} digits.`;
  if (pin !== confirm) return 'The two PINs do not match.';
  return null;
}

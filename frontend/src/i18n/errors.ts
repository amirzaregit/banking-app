import { useCallback } from 'react';

import { ApiError } from '@/api/client';

import { hasKey, translate, type Lang, type MessageKey, type Params } from './index';
import { useI18n } from './provider';

/**
 * Turn anything thrown by the API client into a sentence in the user's language, using the
 * server's stable error CODE and PARAMETERS (never its English text).
 */
export function describeError(lang: Lang, e: unknown, fallback: MessageKey = 'errors.generic'): string {
  if (!(e instanceof ApiError)) return translate(lang, fallback);
  const params = (e.params ?? undefined) as Params | undefined;

  if (e.status === 0 || e.code === 'network') return translate(lang, 'errors.network');
  // Without a phone number to name, the sentence would show a raw "{{phone}}": use the plain one.
  if (e.code === 'otp_required' && !params?.phone) return translate(lang, 'review.codeSent');

  // A few codes carry a REASON that picks a more specific sentence.
  const specific =
    e.code === 'card_declined' ? `errors.card_declined_${params?.reason}` : e.code === 'weak_pin' ? `errors.weak_pin_${params?.reason ?? 'weak'}` : null;
  if (specific && hasKey(lang, specific)) return translate(lang, specific, params);

  if (e.code === 'validation_error') return translate(lang, 'errors.validation');
  const byCode = e.code ? `errors.${e.code}` : null;
  if (byCode && hasKey(lang, byCode)) return translate(lang, byCode, params);

  return translate(lang, fallback);
}

export function useErrors() {
  const { lang } = useI18n();
  return useCallback((e: unknown, fallback?: MessageKey) => describeError(lang, e, fallback), [lang]);
}

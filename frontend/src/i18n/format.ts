import { useMemo } from 'react';

import { formatDate } from '@/lib/date';
import { formatMoney, isolateAuto, isolateLtr } from '@/lib/money';

import { useI18n } from './provider';

/** Money and dates formatted for the current language (calendar, bidi-safe numbers). */
export function useFormat() {
  const { lang, rtl } = useI18n();
  return useMemo(
    () => ({
      money: (cents: number, currency = 'USD') => (rtl ? isolateLtr(formatMoney(cents, currency)) : formatMoney(cents, currency)),
      /** Like money(), with a "+" for positive amounts. The sign sits INSIDE the isolate, so it stays glued to the number in right-to-left text. */
      moneySigned: (cents: number, currency = 'USD') => {
        const text = `${cents > 0 ? '+' : ''}${formatMoney(cents, currency)}`;
        return rtl ? isolateLtr(text) : text;
      },
      date: (iso: string) => formatDate(iso, lang),
      /** Numbers that must read left-to-right even in a right-to-left sentence: account and phone numbers, masked digits. */
      num: (text: string) => (rtl ? isolateLtr(text) : text),
      /** A person's name (or any user-typed text) shown on its own or inside a sentence. */
      name: (text: string) => (rtl && text ? isolateAuto(text) : text),
    }),
    [lang, rtl],
  );
}

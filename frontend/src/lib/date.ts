import type { Lang } from '@/i18n';

import { formatDay, isoOf } from './calendar';
import { gregorianToJalali, JALALI_MONTHS } from './jalali';

const EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RU = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

/**
 * "2026-10-29T16:54:17Z" -> "29 Oct" | "29 окт." | "7 آبان" (Jalali calendar for Persian).
 * Manual on purpose: no dependence on Intl support in the JS engine. Persian digits are applied by <Text>.
 */
export function formatDate(iso: string, lang: Lang = 'en'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (lang === 'fa') {
    const { jm, jd } = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${jd} ${JALALI_MONTHS[jm - 1]}`;
  }
  return `${d.getDate()} ${(lang === 'ru' ? RU : EN)[d.getMonth()]}`;
}

/** "2026-11-09T16:54:17Z" -> "9 Nov 2026, 19:54" (the phone's own time zone; Persian: Jalali date). */
export function formatDateTime(iso: string, lang: Lang = 'en'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDay(isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()), lang)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

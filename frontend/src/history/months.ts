import type { Lang } from '@/i18n';
import { gregorianToJalali, JALALI_MONTHS } from '@/lib/jalali';

const EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** Which month a moment belongs to, in the calendar of the language: Persian groups by Jalali months, the others by Gregorian ones. Key: "2026-11" or "1405-08". */
export function monthKey(iso: string, lang: Lang): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const [y, m] = lang === 'fa' ? (({ jy, jm }) => [jy, jm])(gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())) : [d.getFullYear(), d.getMonth() + 1];
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** "2026-11" -> "November 2026" | "Ноябрь 2026" | "آبان 1405" (digits become Persian when drawn by <Text>). */
export function monthLabel(key: string, lang: Lang): string {
  const [year, month] = key.split('-');
  const names = lang === 'fa' ? JALALI_MONTHS : lang === 'ru' ? RU : EN;
  return `${names[Number(month) - 1] ?? ''} ${year}`;
}

export type MonthRow<T> = { type: 'header'; key: string; month: string; label: string; count: number; open: boolean } | { type: 'item'; key: string; item: T };

/**
 * Turn a newest-first list into month headers followed by that month's items, leaving out the items of collapsed months.
 * Headers count ALL loaded items of their month, so a collapsed month still says how much is hidden.
 */
export function monthRows<T extends { created_at: string }>(items: T[], lang: Lang, collapsed: ReadonlySet<string>, idOf: (item: T) => string | number): MonthRow<T>[] {
  const groups: { month: string; items: T[] }[] = [];
  for (const item of items) {
    const month = monthKey(item.created_at, lang) ?? '0000-00';
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }
  return groups.flatMap((g) => {
    const open = !collapsed.has(g.month);
    const header: MonthRow<T> = { type: 'header', key: `h:${g.month}`, month: g.month, label: monthLabel(g.month, lang), count: g.items.length, open };
    return open ? [header, ...g.items.map((item): MonthRow<T> => ({ type: 'item', key: `i:${idOf(item)}`, item }))] : [header];
  });
}

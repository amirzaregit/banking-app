// Calendar-grid logic for the date picker. Pure functions, no React: Gregorian for English and Russian,
// the Jalali (Solar Hijri) calendar for Persian. Dates travel as ISO "YYYY-MM-DD" strings in BOTH cases,
// so the rest of the app (and the server) never needs to know which calendar the user sees.

import type { Lang } from '@/i18n';

import { gregorianToJalali, jalaliMonthLength, jalaliToGregorian, JALALI_MONTHS } from './jalali';

export type CalendarKind = 'gregorian' | 'jalali';
export type YearMonth = { year: number; month: number }; // month 1..12 of the calendar's own year
export type Cell = { day: number; iso: string } | null; // null = padding before/after the month

export const calendarFor = (lang: Lang): CalendarKind => (lang === 'fa' ? 'jalali' : 'gregorian');

/** First day of the week as a JS weekday (0 = Sunday): Saturday in Iran, Monday in Russia, Sunday in English. */
export const weekStartFor = (lang: Lang): number => (lang === 'fa' ? 6 : lang === 'ru' ? 1 : 0);

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

export function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** Today's date on the phone's own clock, as an ISO day. */
export function todayIso(now: Date = new Date()): string {
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function monthOf(kind: CalendarKind, iso: string): YearMonth {
  const { y, m, d } = parseIso(iso);
  if (kind === 'gregorian') return { year: y, month: m };
  const j = gregorianToJalali(y, m, d);
  return { year: j.jy, month: j.jm };
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** The month as full weeks: padding cells first, then every day, then padding up to a multiple of 7. */
export function monthCells(kind: CalendarKind, ym: YearMonth, weekStart: number): Cell[] {
  const count = kind === 'gregorian' ? new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate() : jalaliMonthLength(ym.year, ym.month);
  const toIso = (d: number): string => {
    if (kind === 'gregorian') return isoOf(ym.year, ym.month, d);
    const g = jalaliToGregorian(ym.year, ym.month, d);
    return isoOf(g.gy, g.gm, g.gd);
  };
  const first = parseIso(toIso(1));
  const weekday = new Date(Date.UTC(first.y, first.m - 1, first.d)).getUTCDay();
  const lead = (weekday - weekStart + 7) % 7;
  const cells: Cell[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= count; d++) cells.push({ day: d, iso: toIso(d) });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS: Record<Lang, string[]> = {
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  fa: ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'], // yekshanbe ... shanbe (Sunday ... Saturday)
};

export function monthTitle(lang: Lang, ym: YearMonth): string {
  const name = lang === 'fa' ? JALALI_MONTHS[ym.month - 1] : (lang === 'ru' ? RU_MONTHS : EN_MONTHS)[ym.month - 1];
  return `${name} ${ym.year}`;
}

/** Weekday headings in display order, starting with the language's first day of the week. */
export function weekdayHeadings(lang: Lang): string[] {
  const start = weekStartFor(lang);
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS[lang][(start + i) % 7]);
}

const EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RU_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

/** "2026-10-30" -> "30 Oct 2026" | "30 окт. 2026" | "8 آبان 1405" (digits become Persian inside <Text>). */
export function formatDay(iso: string, lang: Lang): string {
  const { y, m, d } = parseIso(iso);
  if (lang === 'fa') {
    const j = gregorianToJalali(y, m, d);
    return `${j.jd} ${JALALI_MONTHS[j.jm - 1]} ${j.jy}`;
  }
  return `${d} ${(lang === 'ru' ? RU_SHORT : EN_SHORT)[m - 1]} ${y}`;
}

import { calendarFor, formatDay, monthCells, monthOf, monthTitle, shiftMonth, todayIso, weekdayHeadings, weekStartFor } from '../calendar';
import { gregorianToJalali, jalaliMonthLength, jalaliToGregorian } from '../jalali';

describe('Jalali <-> Gregorian', () => {
  it('Nowruz: 1 Farvardin 1405 is 21 March 2026', () => {
    expect(jalaliToGregorian(1405, 1, 1)).toEqual({ gy: 2026, gm: 3, gd: 21 });
    expect(gregorianToJalali(2026, 3, 21)).toEqual({ jy: 1405, jm: 1, jd: 1 });
  });
  it('round-trips every day for several years', () => {
    for (let t = Date.UTC(2019, 0, 1); t < Date.UTC(2031, 0, 1); t += 86_400_000) {
      const d = new Date(t);
      const g = { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
      const j = gregorianToJalali(g.gy, g.gm, g.gd);
      expect(jalaliToGregorian(j.jy, j.jm, j.jd)).toEqual(g);
    }
  });
  it('month lengths: 31 / 30 / Esfand 29 or 30 in a leap year', () => {
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1403, 12)).toBe(30); // 1403 is a leap year (Nowruz 1404 is 21 March 2025)
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    // the sum of the months matches the real distance between two Nowruzes
    const total = Array.from({ length: 12 }, (_, i) => jalaliMonthLength(1403, i + 1)).reduce((a, b) => a + b, 0);
    expect(total).toBe(366);
  });
});

describe('month grid', () => {
  it('October 2026 (Gregorian): starts on Thursday, 31 days, padded to whole weeks', () => {
    const cells = monthCells('gregorian', { year: 2026, month: 10 }, 0); // Sunday-first
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 4)).toEqual([null, null, null, null]); // Sun..Wed empty
    expect(cells[4]).toEqual({ day: 1, iso: '2026-10-01' });
    expect(cells.filter(Boolean)).toHaveLength(31);
    // Monday-first (Russia): only Monday..Wednesday are empty
    const ru = monthCells('gregorian', { year: 2026, month: 10 }, 1);
    expect(ru.slice(0, 4)).toEqual([null, null, null, { day: 1, iso: '2026-10-01' }]);
  });
  it('Farvardin 1405 (Jalali): 31 days, first cell is 21 March 2026 (a Saturday = first column)', () => {
    const cells = monthCells('jalali', { year: 1405, month: 1 }, 6);
    expect(cells[0]).toEqual({ day: 1, iso: '2026-03-21' });
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells.filter(Boolean).at(-1)).toEqual({ day: 31, iso: '2026-04-20' });
  });
  it('every Jalali cell maps to a distinct, consecutive Gregorian day', () => {
    const days = monthCells('jalali', { year: 1404, month: 12 }, 6).filter((c): c is NonNullable<typeof c> => !!c);
    expect(days).toHaveLength(29);
    for (let i = 1; i < days.length; i++) expect(Date.parse(days[i].iso) - Date.parse(days[i - 1].iso)).toBe(86_400_000);
  });
});

describe('navigation and labels', () => {
  it('shiftMonth wraps years in both directions', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 3 }, -15)).toEqual({ year: 2024, month: 12 });
    expect(shiftMonth({ year: 2026, month: 3 }, 12)).toEqual({ year: 2027, month: 3 });
  });
  it('monthOf converts an ISO day into the calendar the user sees', () => {
    expect(monthOf('gregorian', '2026-10-30')).toEqual({ year: 2026, month: 10 });
    expect(monthOf('jalali', '2026-10-30')).toEqual({ year: 1405, month: 8 }); // Aban
  });
  it('language picks calendar, week start and headings', () => {
    expect(calendarFor('fa')).toBe('jalali');
    expect(calendarFor('ru')).toBe('gregorian');
    expect(weekStartFor('fa')).toBe(6);
    expect(weekdayHeadings('fa')[0]).toBe('ش'); // Saturday first
    expect(weekdayHeadings('ru')[0]).toBe('Пн');
    expect(weekdayHeadings('en')).toHaveLength(7);
  });
  it('titles and day formats', () => {
    expect(monthTitle('en', { year: 2026, month: 10 })).toBe('October 2026');
    expect(monthTitle('fa', { year: 1405, month: 8 })).toBe('آبان 1405');
    expect(formatDay('2026-10-30', 'en')).toBe('30 Oct 2026');
    expect(formatDay('2026-10-30', 'ru')).toBe('30 окт. 2026');
    expect(formatDay('2026-10-30', 'fa')).toBe('8 آبان 1405');
  });
  it('todayIso uses the given clock', () => expect(todayIso(new Date(2026, 9, 5))).toBe('2026-10-05'));
});

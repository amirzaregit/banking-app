import { monthKey, monthLabel, monthRows } from '../months';

const row = (id: number, created_at: string) => ({ id, created_at });
const items = [row(5, '2026-11-20T10:00:00'), row(4, '2026-11-02T10:00:00'), row(3, '2026-10-30T10:00:00'), row(2, '2026-09-01T10:00:00')];
const id = (r: { id: number }) => r.id;

describe('monthKey / monthLabel', () => {
  it('groups by Gregorian month in English and Russian', () => {
    expect(monthKey('2026-11-20T10:00:00', 'en')).toBe('2026-11');
    expect(monthLabel('2026-11', 'en')).toBe('November 2026');
    expect(monthLabel('2026-11', 'ru')).toBe('Ноябрь 2026');
  });
  it('groups by Jalali month in Persian (2026-11-20 is 29 Aban 1405)', () => {
    expect(monthKey('2026-11-20T10:00:00', 'fa')).toBe('1405-08');
    expect(monthLabel('1405-08', 'fa')).toBe('آبان 1405');
  });
  it('rejects a bad date', () => {
    expect(monthKey('nope', 'en')).toBeNull();
  });
});

describe('monthRows', () => {
  it('puts a header before each month and keeps the order', () => {
    const rows = monthRows(items, 'en', new Set(), id);
    expect(rows.map((r) => (r.type === 'header' ? r.label : r.item.id))).toEqual(['November 2026', 5, 4, 'October 2026', 3, 'September 2026', 2]);
  });
  it('hides the items of a collapsed month but still counts them', () => {
    const rows = monthRows(items, 'en', new Set(['2026-11']), id);
    expect(rows.map((r) => r.type)).toEqual(['header', 'header', 'item', 'header', 'item']);
    expect(rows[0]).toMatchObject({ type: 'header', count: 2, open: false });
  });
  it('gives every row a unique key', () => {
    const keys = monthRows(items, 'en', new Set(), id).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('is empty for no items', () => {
    expect(monthRows([], 'en', new Set(), id)).toEqual([]);
  });
});

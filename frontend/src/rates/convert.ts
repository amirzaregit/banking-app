// Currency conversion for the Rates page. The server returns "units of each currency per 1 USD",
// so any pair converts through USD: amount / rate(from) * rate(to).

export const CURRENCIES = ['USD', 'RUB', 'IRR', 'AED', 'EUR', 'CNY', 'JPY'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export type RateTable = Record<string, number>;

/** How many `to` units one `from` unit buys. null when a rate is missing or not a positive number. */
export function pairRate(rates: RateTable, from: string, to: string): number | null {
  const a = rates[from];
  const b = rates[to];
  if (!(a > 0) || !(b > 0)) return null;
  return b / a;
}

export function convert(amount: number, rates: RateTable, from: string, to: string): number | null {
  const rate = pairRate(rates, from, to);
  return rate === null ? null : amount * rate;
}

/** Digits worth showing: 2 for normal amounts, none for huge ones (rials), more for tiny ones (1 RUB in USD). */
export function decimalsFor(value: number): number {
  const v = Math.abs(value);
  if (v >= 1000) return 0;
  if (v >= 1) return 2;
  if (v >= 0.01) return 4;
  return 6;
}

/** 1234567.891 -> "1,234,568" (grouped with commas; <Text> turns the digits Persian when needed). */
export function formatNumber(value: number, decimals = decimalsFor(value)): string {
  if (!Number.isFinite(value)) return '';
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac ? `${grouped}.${frac}` : grouped;
  return value < 0 && Number(fixed) !== 0 ? `-${body}` : body;
}

/** Typed amount ("1 234,5" or "1,234.5") -> number, or null when it is not a usable positive-or-zero number. */
export function parseAmountInput(text: string): number | null {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

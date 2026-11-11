import { normalizeDigits } from '@/i18n/digits';

export type AccountCurrency = 'USD' | 'RUB' | 'IRR';
export const ACCOUNT_CURRENCIES: AccountCurrency[] = ['USD', 'RUB', 'IRR'];

/** Digits after the decimal point: cents and kopecks have 2, the rial has no subunit. Must match the backend. */
export const MINOR_DIGITS: Record<string, number> = { USD: 2, RUB: 2, IRR: 0 };
const SYMBOLS: Record<string, string> = { USD: '$', RUB: '₽', IRR: 'IRR ' };
/** A single character for round badges: $, ₽ and the rial sign. */
export const CURRENCY_GLYPH: Record<string, string> = { USD: '$', RUB: '₽', IRR: '﷼' };
export const minorDigits = (currency: string): number => MINOR_DIGITS[currency] ?? 2;

/** Largest single amount in minor units (about $1,000,000 in each currency). Same caps as the backend. */
export const MAX_AMOUNT: Record<string, number> = { USD: 100_000_000, RUB: 8_000_000_000, IRR: 1_800_000_000_000 };
export const MAX_AMOUNT_CENTS = MAX_AMOUNT.USD;

const group = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Integer minor units -> "$1,234.50" | "₽1,234.50" | "IRR 1,234,500" (or with a leading "-"). By hand: no float math, no Intl. */
export function formatMoney(amount: number, currency = 'USD'): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const digits = minorDigits(currency);
  if (digits === 0) return `${sign}${symbol}${group(abs)}`;
  const unit = 10 ** digits;
  return `${sign}${symbol}${group(Math.floor(abs / unit))}.${(abs % unit).toString().padStart(digits, '0')}`;
}

/**
 * What the user typed -> integer minor units, or null if it isn't a valid positive amount.
 *   USD/RUB: "20" -> 2000   "20.5" -> 2050   "20,50" -> 2050 (comma keyboards)   "0.01" -> 1
 *   IRR:     "50000" -> 50000   (no decimals at all)
 * Rejects: "", "0", "abc", "20.555" (sub-cent), "1,000.50" (ambiguous), negatives.
 * Integer arithmetic only, so there is never a floating-point rounding error.
 */
export function parseAmount(input: string, currency = 'USD'): number | null {
  const digits = minorDigits(currency);
  const text = normalizeDigits(input).trim().replace(',', '.');
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!pattern.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 10 ** digits + (digits === 0 ? 0 : Number(fraction.padEnd(digits, '0')));
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > (MAX_AMOUNT[currency] ?? MAX_AMOUNT.USD)) return null;
  return minor;
}

/** An amount in minor units -> the text the user would type for it: 2500 -> "25.00" (USD/RUB), 50000 -> "50000" (IRR). */
export function minorToInput(amount: number, currency = 'USD'): string {
  const digits = minorDigits(currency);
  if (digits === 0) return String(amount);
  const unit = 10 ** digits;
  return `${Math.floor(amount / unit)}.${(amount % unit).toString().padStart(digits, '0')}`;
}

/** Filter keystrokes as the user types: digits plus ONE separator, only as many decimals as the currency has. */
export function sanitizeAmountInput(text: string, currency = 'USD'): string {
  const digits = minorDigits(currency);
  const cleaned = normalizeDigits(text).replace(',', '.').replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (digits === 0 || rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, digits)}`;
}

/**
 * The thousands separators shown WHILE an amount is typed: "1234567.5" -> "1,234,567.5" ("1234." keeps its dot, so typing a decimal
 * point works). The text the screen stores stays plain ("1234567.5"); only the field shows the commas.
 */
export function groupDigits(text: string): string {
  const [whole, ...rest] = text.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length === 0 ? grouped : `${grouped}.${rest.join('')}`;
}

/**
 * Undo `groupDigits` on what the field now holds after a keystroke: "1,2345" -> "12345". Comma keyboards type "," for the decimal
 * point, so a comma typed as the LAST character (never one of the grouping commas, which are always followed by digits) means
 * "decimal point": "20," -> "20.".
 */
export function ungroupInput(text: string): string {
  const plain = text.replace(/[,٬]/g, '');
  return /[,٬]$/.test(text) && !plain.includes('.') ? `${plain}.` : plain;
}

const LRI = '⁦'; // left-to-right isolate
const PDI = '⁩'; // pop directional isolate

/**
 * In a right-to-left sentence "-$12.50" can get its pieces reordered ("12.50$-"). Wrapping a
 * number in a bidi isolate keeps it intact and reading left-to-right.
 */
export const isolateLtr = (text: string): string => `${LRI}${text}${PDI}`;

const FSI = '\u2068'; // first-strong isolate: the text takes the direction of its first strong letter

/**
 * For text typed by people (names, merchants, devices) inside a sentence. A Latin name stays left-to-right
 * with its punctuation in place ("Bob T." not ".Bob T"), a Persian name stays right-to-left.
 */
export const isolateAuto = (text: string): string => `${FSI}${text}${PDI}`;

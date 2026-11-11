import type { ReactNode } from 'react';

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

/** "12.50" -> "۱۲.۵۰" (display only). */
export const toPersianDigits = (text: string): string => text.replace(/[0-9]/g, (d) => PERSIAN[Number(d)]);

/**
 * Persian and Arabic-Indic digits -> ASCII, plus their decimal/thousands marks. Run on EVERYTHING
 * a user types (amounts, PINs, phone numbers): a Persian keyboard produces "۷۳۹۱۶۲", which our
 * server and regexes would otherwise reject.
 */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (c) => String(PERSIAN.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String(ARABIC_INDIC.indexOf(c)))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

/** Show digits in Persian inside text. Only strings, numbers and lists of them are touched. */
export function localizeNode(node: ReactNode, persian: boolean): ReactNode {
  if (!persian) return node;
  if (typeof node === 'string') return toPersianDigits(node);
  if (typeof node === 'number') return toPersianDigits(String(node));
  if (Array.isArray(node)) return node.map((child) => localizeNode(child, persian));
  return node;
}

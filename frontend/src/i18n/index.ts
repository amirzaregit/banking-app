import { en } from './en';
import { fa } from './fa';
import { ru } from './ru';
import type { MessageKey, Messages } from './types';

export type { MessageKey, Messages } from './types';
export type Lang = 'en' | 'ru' | 'fa';
export type Params = Record<string, string | number | null | undefined>;

export const LANG_CODES: Lang[] = ['en', 'ru', 'fa'];
export const catalogs: Record<Lang, Messages> = { en, ru, fa };

export const isLang = (value: unknown): value is Lang => value === 'en' || value === 'ru' || value === 'fa';
/** Persian is the only right-to-left language we ship. */
export const isRtl = (lang: Lang): boolean => lang === 'fa';

function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export const hasKey = (lang: Lang, key: string): boolean => lookup(catalogs[lang], key) !== undefined;

/** "Attempts left: {{left}}" + {left: 4} -> "Attempts left: 4". Unknown placeholders are left visible. */
function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (params[name] != null ? String(params[name]) : whole));
}

/** Look a message up in `lang`, falling back to English, then to the key itself. */
export function translate(lang: Lang, key: MessageKey | (string & {}), params?: Params): string {
  return interpolate(lookup(catalogs[lang], key) ?? lookup(catalogs.en, key) ?? key, params);
}

/** First language in the device's preference list that we support ("fa-IR" -> "fa"), else English. */
export function detectLanguage(deviceTags: readonly string[]): Lang {
  for (const tag of deviceTags) {
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(primary)) return primary;
  }
  return 'en';
}

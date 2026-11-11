import { ApiError } from '@/api/client';
import { formatDate } from '@/lib/date';
import { gregorianToJalali } from '@/lib/jalali';
import { isolateLtr } from '@/lib/money';

import { localizeNode, normalizeDigits, toPersianDigits } from '../digits';
import { describeError } from '../errors';
import { fontFamily, weightOf } from '../fonts';
import { catalogs, detectLanguage, hasKey, isRtl, LANG_CODES, translate } from '../index';

/** Flatten a nested catalog into {"errors.pin_invalid": "..."}. */
function flatten(node: unknown, prefix = ''): Record<string, string> {
  return Object.entries(node as Record<string, unknown>).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...out, [path]: value } : { ...out, ...flatten(value, path) };
  }, {});
}
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('catalogs', () => {
  const english = flatten(catalogs.en);

  it.each(LANG_CODES)('%s has exactly the same keys as English', (lang) => {
    expect(Object.keys(flatten(catalogs[lang])).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(LANG_CODES)('%s uses the same {{placeholders}} as English in every message', (lang) => {
    const mine = flatten(catalogs[lang]);
    const mismatches = Object.keys(english).filter((key) => placeholders(english[key]).join() !== placeholders(mine[key]).join());
    expect(mismatches).toEqual([]);
  });

  it.each(LANG_CODES)('%s has no empty strings', (lang) => {
    expect(Object.entries(flatten(catalogs[lang])).filter(([, v]) => v.trim() === '')).toEqual([]);
  });

  it('every language names itself in its own script (shown in the language picker)', () => {
    for (const lang of LANG_CODES) expect(catalogs[lang].languages).toEqual({ en: 'English', ru: 'Русский', fa: 'فارسی' });
  });

  it('Russian and Persian are really translated, not copies of English', () => {
    const ru = flatten(catalogs.ru);
    const fa = flatten(catalogs.fa);
    const same = (other: Record<string, string>) => Object.keys(english).filter((k) => other[k] === english[k] && !/^(common\.appName|languages\.|send\.phonePlaceholder|amount\.accountOption|account\.cards\.demoPay|history\.accountLabel|rates\.oneEquals|branches\.osm)/.test(k));
    expect(same(ru)).toEqual([]);
    expect(same(fa)).toEqual([]);
  });
});

describe('translate', () => {
  it('fills in placeholders in each language', () => {
    expect(translate('en', 'errors.pin_invalid', { left: 4 })).toBe('Incorrect PIN. Attempts left: 4.');
    expect(translate('ru', 'errors.pin_invalid', { left: 4 })).toBe('Неверный ПИН-код. Осталось попыток: 4.');
    expect(translate('fa', 'errors.pin_invalid', { left: 4 })).toBe('رمز نادرست است. 4 تلاش دیگر باقی مانده.');
  });
  it('leaves an unknown placeholder visible instead of hiding the bug', () => {
    expect(translate('en', 'errors.pin_invalid', {})).toContain('{{left}}');
  });
  it('falls back to the key itself for a key that does not exist', () => {
    expect(translate('fa', 'no.such.key')).toBe('no.such.key');
    expect(hasKey('en', 'errors.pin_invalid')).toBe(true);
    expect(hasKey('en', 'errors.nope')).toBe(false);
    expect(hasKey('en', 'errors')).toBe(false); // a group is not a message
  });
});

describe('language detection and direction', () => {
  it.each([
    [['fa-IR', 'en-US'], 'fa'],
    [['ru-RU'], 'ru'],
    [['de-DE', 'ru-RU', 'en'], 'ru'], // first SUPPORTED language wins
    [['en_GB'], 'en'],
    [['de-DE', 'fr-FR'], 'en'], // nothing supported: English
    [[], 'en'],
    [['FA'], 'fa'],
  ])('%j -> %s', (tags, expected) => expect(detectLanguage(tags)).toBe(expected));

  it('only Persian is right-to-left', () => {
    expect(LANG_CODES.map((l) => [l, isRtl(l)])).toEqual([['en', false], ['ru', false], ['fa', true]]);
  });
});

describe('digits', () => {
  it('shows Persian digits', () => expect(toPersianDigits('$12.50 · 2422')).toBe('$۱۲.۵۰ · ۲۴۲۲'));
  it.each([
    ['۷۳۹۱۶۲', '739162'],
    ['٧٣٩١٦٢', '739162'], // Arabic-Indic digits from an Arabic keyboard
    ['۱۲٫۵۰', '12.50'], // Persian decimal separator
    ['۱٬۰۰۰', '1,000'],
    ['+۷ ۹۱۲ 345', '+7 912 345'], // mixed
    ['abc', 'abc'],
  ])('normalizeDigits(%j) -> %j', (input, output) => expect(normalizeDigits(input)).toBe(output));

  it('converts only text nodes, only in Persian', () => {
    expect(localizeNode('12', false)).toBe('12');
    expect(localizeNode('12', true)).toBe('۱۲');
    expect(localizeNode(['a1', 5, null], true)).toEqual(['a۱', '۵', null]);
  });
});

describe('fonts', () => {
  it.each([
    ['en', 'regular', 'Manrope_400Regular'],
    ['ru', 'bold', 'Manrope_700Bold'],
    ['fa', 'regular', 'Vazirmatn_400Regular'],
    ['fa', 'extrabold', 'Vazirmatn_800ExtraBold'],
  ] as const)('%s %s -> %s', (lang, weight, family) => expect(fontFamily(lang, weight)).toBe(family));

  it.each([
    [undefined, 'regular'], ['400', 'regular'], ['normal', 'regular'], ['500', 'medium'], ['600', 'semibold'],
    ['700', 'bold'], ['bold', 'bold'], ['800', 'extrabold'], ['900', 'extrabold'],
  ])('fontWeight %j -> %s', (input, weight) => expect(weightOf(input)).toBe(weight));
});

describe('Jalali calendar (checked against known Nowruz dates)', () => {
  it.each([
    [[2022, 3, 21], [1401, 1, 1]],
    [[2023, 3, 21], [1402, 1, 1]],
    [[2024, 3, 20], [1403, 1, 1]],
    [[2025, 3, 21], [1404, 1, 1]],
    [[2026, 3, 21], [1405, 1, 1]],
    [[2025, 3, 20], [1403, 12, 30]], // 1403 is a leap year: its last day is 30 Esfand
    [[2026, 1, 1], [1404, 10, 11]],
    [[2026, 10, 30], [1405, 8, 8]],
    [[2026, 9, 22], [1405, 6, 31]], // last day of Shahrivar (31 days)
    [[2026, 9, 23], [1405, 7, 1]], // first day of Mehr
  ])('%j -> %j', ([gy, gm, gd], [jy, jm, jd]) => expect(gregorianToJalali(gy, gm, gd)).toEqual({ jy, jm, jd }));
});

describe('formatDate', () => {
  const iso = new Date(2026, 9, 30, 12, 0, 0).toISOString(); // local noon: immune to timezone shifts
  it('English, Russian and Persian (Jalali)', () => {
    expect(formatDate(iso, 'en')).toBe('30 Oct');
    expect(formatDate(iso, 'ru')).toBe('30 окт.');
    expect(formatDate(iso, 'fa')).toBe('8 آبان');
  });
  it('returns an empty string for garbage', () => expect(formatDate('not a date', 'fa')).toBe(''));
});

describe('bidi isolation', () => {
  it('wraps a string so right-to-left text cannot reorder it', () => {
    const wrapped = isolateLtr('-$12.50');
    expect(wrapped.startsWith('⁦') && wrapped.endsWith('⁩') && wrapped.includes('-$12.50')).toBe(true);
  });
});

describe('describeError: the server speaks in codes, the app in sentences', () => {
  const api = (status: number, code?: string, params?: Record<string, string | number | null>) => new ApiError(status, 'English fallback', code, params);

  it('uses the code and its parameters, in each language', () => {
    expect(describeError('en', api(403, 'pin_invalid', { left: 2 }))).toBe('Incorrect PIN. Attempts left: 2.');
    expect(describeError('ru', api(429, 'login_throttled', { minutes: 15 }))).toBe('Слишком много неудачных попыток входа. Повторите через 15 мин.');
    expect(describeError('fa', api(422, 'account_limit', { max: 5 }))).toContain('5');
  });
  it('picks a specific sentence from a REASON parameter', () => {
    expect(describeError('en', api(422, 'card_declined', { reason: 'frozen' }))).toBe('Declined: this card is frozen.');
    expect(describeError('ru', api(422, 'card_declined', { reason: 'insufficient_funds' }))).toBe('Отказ: недостаточно средств.');
    expect(describeError('en', api(422, 'weak_pin', { reason: 'format' }))).toBe('The PIN must be exactly 6 digits.');
    expect(describeError('en', api(422, 'weak_pin', { reason: 'weak' }))).toContain('too easy');
    expect(describeError('en', api(422, 'weak_pin'))).toContain('too easy'); // no reason: the common case
  });
  it('a lost connection (status 0) is always the network message', () => {
    expect(describeError('fa', api(0, 'network'))).toBe(catalogs.fa.errors.network);
    expect(describeError('en', api(0))).toBe(catalogs.en.errors.network);
  });
  it('validation errors get one friendly sentence, not a list of fields', () => {
    expect(describeError('en', api(422, 'validation_error'))).toBe(catalogs.en.errors.validation);
  });
  it('an unknown code or a non-API error falls back safely (never English server text)', () => {
    expect(describeError('ru', api(500, 'brand_new_code'))).toBe(catalogs.ru.errors.generic);
    expect(describeError('ru', new Error('boom'))).toBe(catalogs.ru.errors.generic);
    expect(describeError('fa', api(500), 'errors.loadData')).toBe(catalogs.fa.errors.loadData);
  });
  it('every server error code we know about has a translation in all three languages', () => {
    const codes = ['invalid_credentials', 'email_taken', 'phone_taken', 'invalid_phone', 'incorrect_password', 'recipient_not_found',
      'account_not_found', 'account_limit', 'same_account', 'insufficient_funds', 'pin_invalid', 'pin_locked', 'pin_not_set', 'otp_required',
      'otp_invalid', 'otp_expired', 'card_limit', 'card_not_found', 'login_throttled', 'rate_limited', 'statement_too_long', 'bad_date_range',
      'not_found', 'conflict', 'idempotency_conflict', 'session_not_found', 'invalid_refresh_token', 'session_expired', 'network', 'account_not_active'];
    for (const lang of LANG_CODES) for (const code of codes) expect({ lang, code, has: hasKey(lang, `errors.${code}`) }).toEqual({ lang, code, has: true });
  });
});

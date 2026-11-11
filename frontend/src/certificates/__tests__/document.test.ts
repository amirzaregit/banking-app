import { buildCertificateHtml, escapeHtml } from '../document';
import { DOC_TEXTS } from '../texts';
import { CERTIFICATE_TYPES, type Certificate, type CertificateLang, type CertificateType } from '../types';

const ACCOUNT = { number: '9739690351', type: 'checking', currency: 'RUB', status: 'active', opened_on: '2026-03-21', balance: 1_234_567 };

function make(type: CertificateType, language: CertificateLang, name = 'Alice Smith'): Certificate {
  return {
    id: 'c1',
    type,
    language,
    ref_number: 'ST-2026-00001234',
    issued_at: '2026-10-30T10:00:00Z',
    kept: false,
    period_from: null,
    period_to: null,
    data: {
      issued_on: '2026-10-30',
      customer: { full_name: name, email: 'a@example.com', since: '2026-03-21' },
      account: ACCOUNT,
      bank: { name: 'Banking Demo', bic: '044500999', swift: 'DEMORUMM', correspondent_account: '30101810000000000999', inn: '7700000000' },
      period: { from: '2026-10-01', to: '2026-10-30' },
      totals: { income: 500, spending: 200, count: 2 },
      lines: [{ date: '2026-10-02', description: 'Lunch', counterparty: 'Bob T.', counterparty_number: '111', amount: -200, balance_after: 300 }],
      months: [{ month: '2026-10', amount: 500, count: 1 }],
      total: 500,
      count: 1,
      balances: [{ date: '2026-07-31', amount: 100 }, { date: '2026-10-30', amount: 300 }],
      lowest: 100,
      average: 200,
      accounts: [{ number: '9739690351', type: 'checking', currency: 'RUB', status: 'active' }],
      accounts_checked: 1,
      overdrawn: 0,
    },
  };
}

describe('every certificate type renders in every language', () => {
  for (const lang of ['en', 'ru', 'fa'] as const) {
    for (const type of CERTIFICATE_TYPES) {
      it(`${type} / ${lang}`, () => {
        const html = buildCertificateHtml(make(type, lang));
        expect(html).toContain(DOC_TEXTS[lang].titles[type]);
        expect(html).toContain('ST-2026-00001234'.replace(/[0-9]/g, (d) => (lang === 'fa' ? '۰۱۲۳۴۵۶۷۸۹'[Number(d)] : d)));
        expect(html).toContain('<svg'); // logo, stamp and signature
        expect(html).not.toContain('undefined');
        expect(html).not.toContain('NaN');
      });
    }
  }
});

describe('direction, digits and calendar', () => {
  it('Persian documents are right-to-left, with Persian digits and the Jalali calendar', () => {
    const html = buildCertificateHtml(make('balance', 'fa'));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('۱۴۰۵'); // the year in Jalali, in Persian digits
    expect(html).toContain('۹۷۳۹۶۹۰۳۵۱'); // account number
    expect(html).not.toMatch(/<bdi dir="ltr">[^<]*[0-9]/); // no Latin digits left inside numbers
  });
  it('English and Russian are left-to-right with the Gregorian calendar', () => {
    expect(buildCertificateHtml(make('balance', 'en'))).toContain('dir="ltr"');
    const ru = buildCertificateHtml(make('balance', 'ru'));
    expect(ru).toContain('30 окт. 2026');
    expect(ru).toContain('₽12,345.67');
  });
});

describe('safety', () => {
  it('escapes names and descriptions so they cannot inject markup', () => {
    const evil = make('statement', 'en', '<script>alert(1)</script> "Bob"');
    evil.data.lines![0].description = '<img src=x onerror=alert(1)>';
    const html = buildCertificateHtml(evil);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });
  it('escapeHtml covers the five dangerous characters', () => expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;'));
});

describe('content', () => {
  it('a statement lists its lines and totals; bank details list the codes', () => {
    const st = buildCertificateHtml(make('statement', 'en'));
    expect(st).toContain('Lunch');
    expect(st).toContain('Bob T.');
    expect(buildCertificateHtml(make('bank_details', 'en'))).toContain('DEMORUMM');
  });
  it('bank-owned counterparties get a readable label', () => {
    const c = make('statement', 'ru');
    c.data.lines![0] = { ...c.data.lines![0], counterparty: 'Bank', counterparty_number: 'SYSTEM-FX-RUB', description: 'Currency exchange' };
    expect(buildCertificateHtml(c)).toContain('Обмен валюты');
  });
});

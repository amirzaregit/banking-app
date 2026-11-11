// Turns an issued certificate into a printable HTML page (A4) that expo-print converts to a PDF.
// Pure: no React, no network, so it can be unit tested. Everything that comes from data is HTML-escaped.

import { formatDay } from '@/lib/calendar';
import { toPersianDigits } from '@/i18n/digits';
import { formatMoney } from '@/lib/money';

import { DOC_TEXTS, type DocTexts } from './texts';
import type { Certificate, CertificateData, CertificateLang } from './types';

const TEAL = '#00A5AC';
const TEAL_DEEP = '#006D73';
const GOLD = '#DEAD61';
const INK = '#16292B';
const MUTED = '#5B6E70';
const PAPER = '#F7F7F7';

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Per-language helpers: Persian documents use Persian digits and the Jalali calendar. */
export function helpers(lang: CertificateLang, tx: DocTexts) {
  const digits = (s: string) => (lang === 'fa' ? toPersianDigits(s) : s);
  // <bdi dir=ltr> keeps numbers, codes and money in their own left-to-right order inside right-to-left text
  const ltr = (s: string) => `<bdi dir="ltr">${escapeHtml(digits(s))}</bdi>`;
  return {
    digits,
    ltr,
    day: (iso: string) => digits(formatDay(iso, lang)),
    money: (amount: number, currency: string) => ltr(formatMoney(amount, currency)),
    moneyText: (amount: number, currency: string) => digits(formatMoney(amount, currency)),
    accountType: (t: string) => tx.accountType[t] ?? t,
    status: (s: string) => tx.status[s] ?? s,
    counterparty: (name: string, number: string, description: string | null) => {
      if (number.startsWith('SYSTEM-MERCHANTS-')) return tx.merchant;
      if (number.startsWith('SYSTEM-FX-') || description === 'Currency exchange') return tx.exchange;
      if (number.startsWith('SYSTEM-')) return tx.bankParty;
      return name;
    },
    description: (d: string | null, number: string) => (d === 'Demo deposit' ? tx.demoDeposit : d === 'Currency exchange' ? tx.exchange : number.startsWith('SYSTEM-MERCHANTS-') ? (d ?? tx.merchant) : (d ?? '')),
  };
}

export const LOGO = `<svg width="46" height="46" viewBox="0 0 46 46" xmlns="http://www.w3.org/2000/svg"><rect width="46" height="46" rx="14" fill="#fff"/><rect x="9" y="14" width="28" height="20" rx="5" fill="${TEAL}"/><rect x="9" y="14" width="28" height="6" rx="3" fill="${TEAL_DEEP}"/><circle cx="31" cy="26" r="3" fill="#fff"/><circle cx="38" cy="9" r="6" fill="${GOLD}"/></svg>`;

export function stamp(tx: DocTexts): string {
  return `<svg width="150" height="150" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-12 75 75)" fill="none" stroke="${TEAL_DEEP}" opacity="0.88">
<circle cx="75" cy="75" r="70" stroke-width="3"/><circle cx="75" cy="75" r="63" stroke-width="1"/><circle cx="75" cy="75" r="37" stroke-width="1.5"/>
<path id="arc" d="M 75 75 m -50 0 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0" stroke="none"/>
<text font-size="10.5" font-weight="700" fill="${TEAL_DEEP}" stroke="none" letter-spacing="1.6"><textPath href="#arc" startOffset="2">${escapeHtml(tx.stamp)}</textPath></text>
<text x="75" y="71" text-anchor="middle" font-size="12" font-weight="800" fill="${TEAL_DEEP}" stroke="none">${escapeHtml(tx.stampCenter)}</text>
<path d="M 52 80 L 98 80" stroke-width="1.5"/><circle cx="75" cy="92" r="4" fill="${GOLD}" stroke="none"/></g></svg>`;
}

export const SIGNATURE = `<svg width="150" height="56" viewBox="0 0 150 56" xmlns="http://www.w3.org/2000/svg"><path d="M6 38 C 18 4, 30 58, 44 26 S 62 6, 72 30 S 92 50, 104 22 S 126 14, 144 30" fill="none" stroke="#1B3A6B" stroke-width="2.2" stroke-linecap="round"/><path d="M20 48 L 130 44" fill="none" stroke="#1B3A6B" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/></svg>`;

const row = (label: string, value: string) => `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;

/** The facts of the letter, as a table or paragraph, depending on the type. */
function body(cert: Certificate, tx: DocTexts, h: ReturnType<typeof helpers>): string {
  const d: CertificateData = cert.data;
  const a = d.account;
  const name = escapeHtml(d.customer.full_name);
  const common: Record<string, string> = { name: `<b>${name}</b>`, issued: h.day(d.issued_on) };
  if (a) {
    Object.assign(common, {
      type: escapeHtml(h.accountType(a.type)),
      number: h.ltr(a.number),
      currency: escapeHtml(a.currency),
      opened: h.day(a.opened_on),
      status: escapeHtml(h.status(a.status)),
      balance: h.money(a.balance, a.currency),
    });
  }
  const period = d.period ? `${d.period.from ? h.day(d.period.from) : escapeHtml(tx.all)} – ${d.period.to ? h.day(d.period.to) : h.day(d.issued_on)}` : '';
  const sentence = (extra: Record<string, string> = {}) => `<p class="lead">${tx.sentences[cert.type]({ ...common, ...extra })}</p>`;

  switch (cert.type) {
    case 'account_confirmation':
      return sentence() + `<table class="facts">${row(tx.holder, name)}${row(tx.accountNo, h.ltr(a!.number))}${row(tx.col.type, escapeHtml(h.accountType(a!.type)))}${row(tx.currency, escapeHtml(a!.currency))}${row(tx.opened, h.day(a!.opened_on))}</table>`;
    case 'balance':
      return sentence() + `<table class="facts">${row(tx.holder, name)}${row(tx.accountNo, h.ltr(a!.number))}${row(tx.balance, `<b>${h.money(a!.balance, a!.currency)}</b>`)}</table>`;
    case 'bank_details': {
      const b = d.bank!;
      return (
        sentence() +
        `<table class="facts">${row(tx.holder, name)}${row(tx.accountNo, h.ltr(a!.number))}${row(tx.currency, escapeHtml(a!.currency))}${row(tx.bankLabel, escapeHtml(b.name))}${row(tx.bic, h.ltr(b.bic))}${row(tx.swift, h.ltr(b.swift))}${row(tx.corr, h.ltr(b.correspondent_account))}${row(tx.inn, h.ltr(b.inn))}</table>`
      );
    }
    case 'statement': {
      const t = d.totals!;
      const lines = (d.lines ?? [])
        .map(
          (l) =>
            `<tr><td>${h.day(l.date)}</td><td>${escapeHtml(h.description(l.description, l.counterparty_number))}</td><td>${escapeHtml(h.counterparty(l.counterparty, l.counterparty_number, l.description))}</td><td class="num">${h.money(l.amount, a!.currency)}</td><td class="num">${h.money(l.balance_after, a!.currency)}</td></tr>`,
        )
        .join('');
      return (
        sentence({ period }) +
        `<table class="facts">${row(tx.moneyIn, h.money(t.income, a!.currency))}${row(tx.moneyOut, h.money(t.spending, a!.currency))}${row(tx.operations, h.ltr(String(t.count)))}</table>` +
        `<table class="grid"><thead><tr><th>${escapeHtml(tx.col.date)}</th><th>${escapeHtml(tx.col.description)}</th><th>${escapeHtml(tx.col.counterparty)}</th><th>${escapeHtml(tx.col.amount)}</th><th>${escapeHtml(tx.col.balance)}</th></tr></thead><tbody>${lines}</tbody></table>` +
        (d.truncated ? `<p class="note">${escapeHtml(tx.truncated)}</p>` : '')
      );
    }
    case 'income': {
      const months = (d.months ?? [])
        .map((m) => `<tr><td>${h.ltr(m.month)}</td><td class="num">${h.money(m.amount, a!.currency)}</td><td class="num">${h.ltr(String(m.count))}</td></tr>`)
        .join('');
      return (
        sentence({ period, total: h.money(d.total ?? 0, a!.currency), count: h.ltr(String(d.count ?? 0)) }) +
        `<table class="grid"><thead><tr><th>${escapeHtml(tx.col.month)}</th><th>${escapeHtml(tx.col.amount)}</th><th>${escapeHtml(tx.col.payments)}</th></tr></thead><tbody>${months}</tbody></table>`
      );
    }
    case 'proof_of_funds': {
      const points = (d.balances ?? []).map((p) => `<tr><td>${h.day(p.date)}</td><td class="num">${h.money(p.amount, a!.currency)}</td></tr>`).join('');
      return (
        sentence() +
        `<table class="grid"><thead><tr><th>${escapeHtml(tx.col.date)}</th><th>${escapeHtml(tx.balance)}</th></tr></thead><tbody>${points}</tbody></table>` +
        `<table class="facts">${row(tx.lowest, h.money(d.lowest ?? 0, a!.currency))}${row(tx.average, h.money(d.average ?? 0, a!.currency))}</table>`
      );
    }
    case 'relationship': {
      const list = (d.accounts ?? [])
        .map((x) => `<tr><td>${h.ltr(x.number)}</td><td>${escapeHtml(h.accountType(x.type))}</td><td>${escapeHtml(x.currency)}</td><td>${escapeHtml(h.status(x.status))}</td></tr>`)
        .join('');
      return (
        sentence({ since: h.day(d.customer.since), count: h.ltr(String((d.accounts ?? []).length)) }) +
        `<table class="grid"><thead><tr><th>${escapeHtml(tx.col.account)}</th><th>${escapeHtml(tx.col.type)}</th><th>${escapeHtml(tx.currency)}</th><th>${escapeHtml(tx.col.status)}</th></tr></thead><tbody>${list}</tbody></table>`
      );
    }
    case 'no_debt':
      return sentence({ count: h.ltr(String(d.accounts_checked ?? 0)) });
  }
}

/** What the shared A4 page needs: the document's language, its heading and reference, and the HTML of its body. */
export type PageParts = { lang: CertificateLang; title: string; ref: string; issuedOn: string; bodyHtml: string; concern?: string };

/**
 * The A4 letter every document uses: teal band with the bank's mark, title, reference and date, the body, then signature,
 * stamp and footer. Certificates and insurance policies both print on it, so they look like the same bank wrote them.
 */
export function renderPage({ lang, title, ref, issuedOn, bodyHtml, concern }: PageParts): string {
  const tx = DOC_TEXTS[lang];
  const h = helpers(lang, tx);
  const rtl = lang === 'fa';
  const font = rtl ? "'Vazirmatn','Noto Naskh Arabic','Noto Sans Arabic','Segoe UI',Tahoma,sans-serif" : "'Manrope','Segoe UI',Roboto,Arial,sans-serif";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)} ${escapeHtml(ref)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: ${INK}; font-family: ${font}; font-size: 13px; line-height: ${rtl ? 1.9 : 1.55}; }
  .page { width: 100%; min-height: 100vh; position: relative; padding-bottom: 28mm; }
  .band { background: ${TEAL}; color: #fff; padding: 14mm 16mm 10mm; display: flex; align-items: center; gap: 14px; }
  .band .name { font-size: 24px; font-weight: 800; letter-spacing: ${rtl ? 0 : 0.3}px; }
  .band .kind { font-size: 12px; opacity: 0.92; }
  .goldline { height: 5px; background: ${GOLD}; }
  .content { padding: 10mm 16mm 0; }
  h1 { margin: 0 0 4px; font-size: 22px; color: ${TEAL_DEEP}; }
  .meta { display: flex; justify-content: space-between; gap: 16px; color: ${MUTED}; font-size: 12px; margin-bottom: 10mm; border-bottom: 1px solid #DCE8E8; padding-bottom: 8px; }
  .concern { color: ${MUTED}; margin-bottom: 4mm; }
  .lead { font-size: 14px; margin: 0 0 6mm; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 6mm; }
  table.facts th { text-align: start; width: 38%; font-weight: 600; color: ${MUTED}; padding: 6px 10px; background: ${PAPER}; border-bottom: 1px solid #fff; }
  table.facts td { padding: 6px 10px; background: ${PAPER}; border-bottom: 1px solid #fff; font-weight: 600; }
  table.grid th { background: ${TEAL_DEEP}; color: #fff; padding: 7px 8px; font-size: 12px; text-align: start; }
  table.grid td { padding: 6px 8px; border-bottom: 1px solid #E6EEEE; font-size: 12px; }
  table.grid tbody tr:nth-child(even) td { background: ${PAPER}; }
  .num { text-align: end; white-space: nowrap; }
  .note { color: ${MUTED}; font-size: 11px; }
  .holder { font-size: 20px; font-weight: 800; color: ${INK}; margin: 0 0 6mm; }
  .signoff { position: absolute; left: 16mm; right: 16mm; bottom: 24mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .sig { text-align: center; }
  .sig .who { font-weight: 800; }
  .sig .role { color: ${MUTED}; font-size: 11px; max-width: 70mm; }
  .footer { position: absolute; left: 16mm; right: 16mm; bottom: 9mm; border-top: 2px solid ${GOLD}; padding-top: 6px; color: ${MUTED}; font-size: 10.5px; display: flex; justify-content: space-between; gap: 12px; }
</style>
</head>
<body>
<div class="page">
  <div class="band">${LOGO}<div><div class="name">${escapeHtml(tx.bank)}</div><div class="kind">${escapeHtml(tx.bankKind)}</div></div></div>
  <div class="goldline"></div>
  <div class="content">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta"><span>${escapeHtml(tx.ref)}: ${h.ltr(ref)}</span><span>${escapeHtml(tx.date)}: ${h.day(issuedOn)}</span></div>
    <div class="concern">${escapeHtml(concern ?? tx.concern)}</div>
    ${bodyHtml}
  </div>
  <div class="signoff">
    <div class="sig">${SIGNATURE}<div class="who">${escapeHtml(tx.signatory)}</div>${tx.position ? `<div class="role">${escapeHtml(tx.position)}</div>` : ''}</div>
    ${stamp(tx)}
  </div>
  <div class="footer"><span>${escapeHtml(tx.footer)}</span><span>${h.ltr(ref)}</span></div>
</div>
</body>
</html>`;
}

/** The complete HTML document for one certificate, in the certificate's own language and direction. */
export function buildCertificateHtml(cert: Certificate): string {
  const lang = cert.language;
  const tx = DOC_TEXTS[lang];
  const h = helpers(lang, tx);
  return renderPage({ lang, title: tx.titles[cert.type], ref: cert.ref_number, issuedOn: cert.data.issued_on, bodyHtml: body(cert, tx, h) });
}

export const certificateFileName = (cert: Certificate): string => `${cert.type}-${cert.ref_number}.pdf`;

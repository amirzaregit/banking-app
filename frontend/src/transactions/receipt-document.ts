// The receipt ("fish", "check") of one transaction: HTML for an A4 page that expo-print turns into a PDF, on the bank's usual
// page (band, stamp, signature) so it looks like the other documents. Pure, so it is unit tested. Every value from data is escaped.

import type { TransactionDetail } from '@/api/types';
import { escapeHtml, helpers, renderPage } from '@/certificates/document';
import { DOC_TEXTS } from '@/certificates/texts';
import { translate, type Lang } from '@/i18n';
import { formatDateTime } from '@/lib/date';

const row = (label: string, value: string) => `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;

export const receiptFileName = (d: TransactionDetail): string => `receipt-${d.receipt_number}.pdf`;

/** The bank's own accounts have fixed numbers; the server names them in English, so they are named here in the document's language. */
function partyName(d: TransactionDetail, t: (key: string) => string): string {
  const n = d.counterparty_account_number;
  if (n.startsWith('SYSTEM-RESERVE-')) return t('account.bank');
  if (n.startsWith('SYSTEM-MERCHANTS-')) return t('account.cardPayment');
  if (n.startsWith('SYSTEM-FX-')) return t('account.exchange');
  return d.counterparty_name;
}

/** The receipt for `d`, issued to `holder` (the signed-in customer), in `lang`. */
export function buildReceiptHtml(d: TransactionDetail, holder: string, lang: Lang): string {
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  const h = helpers(lang, DOC_TEXTS[lang]);
  const incoming = d.amount > 0;
  const other = partyName(d, t);
  const mine = `${escapeHtml(holder)} · ${h.ltr(`••${d.account_number.slice(-4)}`)}`;
  const theirs = d.counterparty_account_number.startsWith('SYSTEM-') ? escapeHtml(other) : `${escapeHtml(other)} · ${h.ltr(`••${d.counterparty_account_number.slice(-4)}`)}`;

  const rows = [
    row(t('transaction.amount'), `<b>${h.money(Math.abs(d.amount), d.currency)}</b>`),
    row(t('transaction.date'), h.digits(escapeHtml(formatDateTime(d.created_at, lang)))),
    row(t('transaction.type'), escapeHtml(t(`transaction.kinds.${d.kind}`))),
    row(t('transaction.status'), escapeHtml(t(`transaction.statuses.${d.status}`))),
    row(t('transaction.from'), incoming ? theirs : mine),
    row(t('transaction.to'), incoming ? mine : theirs),
  ];
  if (d.exchange) {
    rows.push(row(t('transaction.rate'), h.ltr(`1 ${incoming ? d.exchange.other_currency : d.currency} = ${(incoming ? 1 / d.exchange.rate : d.exchange.rate).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${incoming ? d.currency : d.exchange.other_currency}`)));
    rows.push(row(incoming ? t('transaction.paidFrom') : t('transaction.received'), h.money(d.exchange.other_amount, d.exchange.other_currency)));
  }
  if (d.card_last4) rows.push(row(t('transaction.card'), h.ltr(`••${d.card_last4}`)));
  if (d.description && d.kind !== 'deposit' && d.kind !== 'top_up' && d.kind !== 'exchange') rows.push(row(t('transaction.details'), escapeHtml(d.description)));
  rows.push(row(t('transaction.balanceAfter'), h.money(d.balance_after, d.currency)));
  rows.push(row(t('transaction.receiptNumber'), h.ltr(d.receipt_number)));

  const lead = t('transaction.doc.lead', { date: h.digits(escapeHtml(formatDateTime(d.created_at, lang))) });
  return renderPage({
    lang,
    title: t('transaction.doc.title'),
    ref: d.receipt_number,
    issuedOn: d.created_at.slice(0, 10),
    concern: t('transaction.doc.concern'),
    bodyHtml: `<p class="lead">${lead}</p><table class="facts">${rows.join('')}</table>`,
  });
}

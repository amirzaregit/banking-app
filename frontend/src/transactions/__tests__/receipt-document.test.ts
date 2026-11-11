import type { TransactionDetail } from '@/api/types';

import { buildReceiptHtml, receiptFileName } from '../receipt-document';

const base: TransactionDetail = {
  id: 7,
  transfer_id: 't1',
  receipt_number: 'RCP-3F9A1C07B2D4',
  kind: 'transfer',
  amount: -125_050,
  currency: 'USD',
  balance_after: 874_950,
  created_at: '2026-11-09T16:54:00Z',
  status: 'completed',
  description: 'Rent for <November>',
  counterparty_name: 'Bob <script>x</script> Jones',
  counterparty_account_number: '40817810000000005678',
  account_id: 'a1',
  account_type: 'checking',
  account_number: '40817810000000001234',
  card_last4: null,
  provider_id: null,
  gift_design: null,
  exchange: null,
};

describe('buildReceiptHtml', () => {
  it('prints the amount, the receipt number, both parties and the balance', () => {
    const html = buildReceiptHtml(base, 'Alice Smith', 'en');
    expect(html).toContain('Payment Receipt');
    expect(html).toContain('RCP-3F9A1C07B2D4');
    expect(html).toContain('$1,250.50');
    expect(html).toContain('Alice Smith');
    expect(html).toContain('••1234');
    expect(html).toContain('••5678');
    expect(html).toContain('$8,749.50');
    expect(html).toContain('Transfer');
  });

  it('puts the customer on the From side for money out and on the To side for money in', () => {
    const out = buildReceiptHtml(base, 'Alice Smith', 'en');
    expect(out.indexOf('Alice Smith')).toBeLessThan(out.indexOf('Bob'));
    const inn = buildReceiptHtml({ ...base, amount: 125_050 }, 'Alice Smith', 'en');
    expect(inn.indexOf('Bob')).toBeLessThan(inn.indexOf('Alice Smith'));
  });

  it('escapes names and the description instead of injecting markup', () => {
    const html = buildReceiptHtml(base, 'Alice <b>Smith</b>', 'en');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Rent for &lt;November&gt;');
    expect(html).toContain('Alice &lt;b&gt;Smith&lt;/b&gt;');
  });

  it('names the bank side in the document language, not in the server English', () => {
    const topUp = { ...base, kind: 'deposit' as const, amount: 10_000, counterparty_name: 'Bank', counterparty_account_number: 'SYSTEM-RESERVE-USD', description: 'Demo deposit' };
    expect(buildReceiptHtml(topUp, 'Alice', 'ru')).toContain('Банк');
    expect(buildReceiptHtml(topUp, 'Alice', 'en')).not.toContain('SYSTEM-RESERVE');
  });

  it('shows the exchange rate and the other currency for an exchange', () => {
    const fx = { ...base, kind: 'exchange' as const, amount: -3_000, counterparty_account_number: 'SYSTEM-FX-USD', exchange: { rate: 80, other_amount: 240_000, other_currency: 'RUB' } };
    const html = buildReceiptHtml(fx, 'Alice', 'en');
    expect(html).toContain('1 USD = 80 RUB');
    expect(html).toContain('₽2,400.00');
  });

  it('is right-to-left with Persian digits in Persian', () => {
    const html = buildReceiptHtml(base, 'علی', 'fa');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('رسید پرداخت');
    expect(html).toContain('۱۴۰۵');
  });

  it('names the file after the receipt number', () => {
    expect(receiptFileName(base)).toBe('receipt-RCP-3F9A1C07B2D4.pdf');
  });
});

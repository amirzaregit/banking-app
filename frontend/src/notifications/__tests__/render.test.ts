import type { AppNotification } from '@/api/types';
import { translate, type Lang } from '@/i18n';
import { formatMoney } from '@/lib/money';

import { renderNotification } from '../render';

const make = (kind: string, params: Record<string, unknown> | null): AppNotification =>
  ({ id: '1', kind, title: 'ENGLISH TITLE', body: 'ENGLISH BODY', created_at: '2026-10-30T10:00:00Z', read_at: null, params }) as AppNotification;

const render = (lang: Lang, n: AppNotification) => renderNotification(n, (key, params) => translate(lang, key, params), formatMoney);

describe('renderNotification', () => {
  const received = make('payment_received', { sender: 'Alice S.', amount: 1250, currency: 'USD', description: 'Lunch' });

  it('writes "money received" in each language, with the amount and message', () => {
    expect(render('en', received)).toEqual({ title: 'Money received', body: 'Alice S. sent you $12.50. “Lunch”' });
    expect(render('ru', received).body).toBe('Alice S. отправил(а) вам $12.50. «Lunch»');
    expect(render('fa', received).body).toBe('Alice S. مبلغ $12.50 برایتان فرستاد. «Lunch»');
  });

  it('leaves out the message part when there is none', () => {
    const plain = make('payment_received', { sender: 'Alice S.', amount: 100, currency: 'USD', description: null });
    expect(render('en', plain).body).toBe('Alice S. sent you $1.00.');
  });

  it('distinguishes setting a PIN from changing it', () => {
    expect(render('en', make('pin_changed', { first: true })).title).toBe('Payment PIN set');
    expect(render('en', make('pin_changed', { first: false })).title).toBe('Payment PIN changed');
  });

  it('fills in device, minutes and card digits', () => {
    expect(render('en', make('new_sign_in', { device: 'Pixel 8' })).body).toContain('Pixel 8');
    expect(render('en', make('new_sign_in', { device: null })).body).toContain('a new device');
    expect(render('ru', make('pin_locked', { minutes: 15 })).body).toContain('15 мин');
    expect(render('en', make('card_frozen', { last4: '2160' })).title).toBe('Card ••2160 frozen');
    expect(render('fa', make('card_unfrozen', { last4: '2160' })).title).toContain('2160');
    expect(render('en', make('card_purchase', { amount: 450, currency: 'USD', merchant: 'Coffee House', last4: '2160' })).body).toBe('$4.50 at Coffee House (card ••2160).');
  });

  it('falls back to the server English for old rows without parameters or unknown kinds', () => {
    expect(render('fa', make('payment_received', null))).toEqual({ title: 'ENGLISH TITLE', body: 'ENGLISH BODY' });
    expect(render('fa', make('something_new', { x: 1 }))).toEqual({ title: 'ENGLISH TITLE', body: 'ENGLISH BODY' });
  });
});

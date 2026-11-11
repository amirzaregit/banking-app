import type { AppNotification } from '@/api/types';
import type { Params } from '@/i18n';

type T = (key: string, params?: Params) => string;

/**
 * Write a notification in the user's language from its KIND and PARAMETERS.
 * Rows without parameters (older ones) fall back to the English text the server stored.
 */
export function renderNotification(n: AppNotification, t: T, money: (cents: number, currency?: string) => string): { title: string; body: string } {
  const p = n.params ?? null;
  if (p === null) return { title: n.title, body: n.body };

  const str = (key: string) => (typeof p[key] === 'string' ? (p[key] as string) : '');
  const num = (key: string) => (typeof p[key] === 'number' ? (p[key] as number) : 0);

  switch (n.kind) {
    case 'payment_received': {
      const amount = money(num('amount'), str('currency') || 'USD');
      const description = str('description');
      if (str('gift_design')) {
        return {
          title: t('notifications.gift_received.title'),
          body: description ? t('notifications.gift_received.bodyWithNote', { sender: str('sender'), amount, description }) : t('notifications.gift_received.body', { sender: str('sender'), amount }),
        };
      }
      return {
        title: t('notifications.payment_received.title'),
        body: description
          ? t('notifications.payment_received.bodyWithNote', { sender: str('sender'), amount, description })
          : t('notifications.payment_received.body', { sender: str('sender'), amount }),
      };
    }
    case 'request_paid':
      return { title: t('notifications.request_paid.title'), body: t('notifications.request_paid.body', { payer: str('payer'), amount: money(num('amount'), str('currency') || 'USD') }) };
    case 'new_sign_in':
      return {
        title: t('notifications.new_sign_in.title'),
        body: t('notifications.new_sign_in.body', { device: str('device') || t('notifications.new_sign_in.unknownDevice') }),
      };
    case 'pin_changed':
      return {
        title: p.first === true ? t('notifications.pin_changed.titleFirst') : t('notifications.pin_changed.title'),
        body: t('notifications.pin_changed.body'),
      };
    case 'pin_locked':
      return { title: t('notifications.pin_locked.title'), body: t('notifications.pin_locked.body', { minutes: num('minutes') }) };
    case 'card_frozen':
    case 'card_unfrozen':
      return { title: t(`notifications.${n.kind}.title`, { last4: str('last4') }), body: t(`notifications.${n.kind}.body`) };
    case 'account_blocked':
    case 'account_unblocked':
    case 'card_blocked':
      return { title: t(`notifications.${n.kind}.title`, { last4: str('last4') }), body: t(`notifications.${n.kind}.body`) };
    case 'card_order_placed':
    case 'block_requested':
    case 'block_rejected':
      return { title: t(`notifications.${n.kind}.title`), body: t(`notifications.${n.kind}.body`) };
    case 'card_order_ready':
      return { title: t('notifications.card_order_ready.title'), body: t('notifications.card_order_ready.body', { branch: t(`branches.items.${str('branch_id')}.name`) }) };
    case 'insurance_bought':
      return { title: t('notifications.insurance_bought.title'), body: t('notifications.insurance_bought.body', { product: t(`insurance.products.${str('product')}.name`), number: str('policy_number') }) };
    case 'card_purchase':
      return {
        title: t('notifications.card_purchase.title'),
        body: t('notifications.card_purchase.body', { amount: money(num('amount'), str('currency') || 'USD'), merchant: str('merchant'), last4: str('last4') }),
      };
    default:
      return { title: n.title, body: n.body };
  }
}

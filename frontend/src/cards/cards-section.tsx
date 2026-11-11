import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import type { BlockRequest, Card as CardModel, PurchaseResult } from '@/api/types';
import { Text } from '@/components/text';
import { CardArt } from './card-art';
import { ReviewBanner } from './review-banner';
import { ActionRow, Button, Caption, ErrorText, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

const DEMO_MERCHANT = 'Coffee House';
// About $4.50 in each currency, in minor units.
const DEMO_AMOUNTS: Record<string, number> = { USD: 450, RUB: 35_000, IRR: 8_000_000 };

type Notice = { text: string; ok: boolean };

/** A bank card drawn in the brand colors: deep teal, gold chip. Dimmed when frozen. */
function CardVisual({ card, currency }: { card: CardModel; currency: string }) {
  const theme = useTheme();
  const { t } = useI18n();
  const frozen = card.status === 'frozen';
  const blocked = card.status === 'blocked';
  return (
    <View style={[styles.card, { backgroundColor: theme.hero, opacity: frozen || blocked ? 0.6 : 1 }]}>
      <View style={[styles.coin, { backgroundColor: theme.gold }]} />
      {/* The currency's own artwork (Iran: Azadi + Milad towers, Russia: the Kremlin, USD: a globe), in the card's gold */}
      <View pointerEvents="none" style={styles.art}>
        <CardArt currency={currency} color={theme.gold} />
      </View>
      <View style={styles.cardTop}>
        <Text style={{ color: theme.onHero, fontSize: 15, fontWeight: '800' }}>{t('common.appName')}</Text>
        <Ionicons name="wifi" size={22} color={theme.onHeroMuted} style={{ transform: [{ rotate: '90deg' }] }} />
      </View>
      <View style={[styles.chip, { backgroundColor: theme.gold }]}>
        <View style={[styles.chipLine, { backgroundColor: theme.onGold }]} />
        <View style={[styles.chipLine, { backgroundColor: theme.onGold }]} />
      </View>
      <Text style={{ color: theme.onHero, fontSize: 22, fontWeight: '700', letterSpacing: 2, textAlign: 'left', writingDirection: 'ltr' }}>
        •••• •••• •••• {card.last4}
      </Text>
      <View style={styles.cardBottom}>
        <Text style={{ color: theme.onHeroMuted, fontSize: 13, fontWeight: '600' }}>{t('account.cards.expires', { date: card.expiry })}</Text>
        <View style={[styles.status, { backgroundColor: frozen || blocked ? theme.danger : theme.gold }]}>
          <Text style={{ color: frozen || blocked ? theme.background : theme.onGold, fontSize: 11, fontWeight: '800' }}>
            {blocked ? t('cardServices.cardBlocked') : frozen ? t('account.cards.frozen').split(':')[0] : t('account.cards.active')}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Virtual cards for one account: create, freeze/unfreeze, and a demo "shop charges my card" button. */
export function CardsSection({
  accountId,
  currency,
  onSpent,
  reviews,
  reloadKey,
  onDecided,
}: {
  accountId: string;
  currency: string;
  onSpent: () => void;
  reviews: BlockRequest[]; // block requests waiting for a specialist
  reloadKey: number; // change it to reload the cards (e.g. after a specialist decision)
  onDecided: () => void;
}) {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const demoAmount = DEMO_AMOUNTS[currency] ?? DEMO_AMOUNTS.USD;
  const [cards, setCards] = useState<CardModel[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void reloadKey; // listed in the dependencies below so a new value reloads the cards
      let active = true;
      api<CardModel[]>(`/accounts/${accountId}/cards`)
        .then((list) => active && setCards(list))
        .catch((e) => active && setError(describe(e, 'errors.loadData')));
      return () => {
        active = false;
      };
    }, [accountId, describe, reloadKey]),
  );

  const replace = (updated: CardModel) => setCards((list) => (list ?? []).map((c) => (c.id === updated.id ? updated : c)));

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  const create = () =>
    run('create', async () => {
      const card = await api<CardModel>(`/accounts/${accountId}/cards`, { method: 'POST' });
      setCards((list) => [...(list ?? []), card]);
    });

  const toggle = (card: CardModel) =>
    run(card.id, async () => {
      const action = card.status === 'active' ? 'freeze' : 'unfreeze';
      replace(await api<CardModel>(`/cards/${card.id}/${action}`, { method: 'POST' }));
    });

  async function demoPurchase(card: CardModel) {
    setBusy(`buy-${card.id}`);
    setError(null);
    setNotice(null);
    try {
      await api<PurchaseResult>(`/cards/${card.id}/purchase`, { method: 'POST', body: { merchant: DEMO_MERCHANT, amount: demoAmount } });
      setNotice({ ok: true, text: t('account.cards.approved', { amount: fmt.money(demoAmount, currency), merchant: DEMO_MERCHANT }) });
      onSpent(); // refresh the balance and history
    } catch (e) {
      if (e instanceof ApiError && e.code === 'card_declined') setNotice({ ok: false, text: describe(e) });
      else setError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <SectionTitle>{t('account.cards.title')}</SectionTitle>

      {(cards ?? []).map((card) => {
        const frozen = card.status === 'frozen';
        const review = reviews.find((r) => r.card_id === card.id);
        if (card.status === 'blocked') {
          return (
            <View key={card.id} style={{ gap: Spacing.two }}>
              <CardVisual card={card} currency={currency} />
              <Caption>{t('cardServices.blockedCardNote')}</Caption>
              <ActionRow title={t('cardServices.findBranch')} icon="location-outline" onPress={() => router.push('/branches')} />
            </View>
          );
        }
        return (
          <View key={card.id} style={{ gap: Spacing.two }}>
            <CardVisual card={card} currency={currency} />
            {review ? <ReviewBanner request={review} onDecided={onDecided} /> : null}
            <ActionRow
              title={frozen ? t('account.cards.unfreeze') : t('account.cards.freeze')}
              icon={frozen ? 'play-circle-outline' : 'snow-outline'}
              onPress={() => toggle(card)}
              loading={busy === card.id}
            />
            <ActionRow
              title={t('account.cards.demoPay', { amount: fmt.money(demoAmount, currency), merchant: DEMO_MERCHANT })}
              icon="cafe-outline"
              onPress={() => demoPurchase(card)}
              loading={busy === `buy-${card.id}`}
            />
            {review ? null : (
              <ActionRow title={t('cardServices.blockCard')} sub={t('cardServices.blockCardSub')} icon="warning-outline" onPress={() => router.push({ pathname: '/block', params: { id: accountId, card: card.id } })} />
            )}
          </View>
        );
      })}

      {notice ? (
        <Text accessibilityRole="alert" style={{ color: notice.ok ? theme.success : theme.danger, fontWeight: '700', fontSize: 15 }}>
          {notice.text}
        </Text>
      ) : null}
      <ErrorText>{error}</ErrorText>

      {cards !== null && cards.length === 0 ? (
        <Button title={t('account.cards.create')} icon="card-outline" variant="secondary" onPress={create} loading={busy === 'create'} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three, overflow: 'hidden', minHeight: 190, justifyContent: 'space-between' },
  // behind the card number, toward the end edge; low opacity so text on top stays readable
  art: { position: 'absolute', end: 8, bottom: 6, opacity: 0.6 },
  coin: { position: 'absolute', end: -50, top: -60, width: 170, height: 170, borderRadius: 85, opacity: 0.2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { width: 44, height: 32, borderRadius: 7, justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  chipLine: { height: 2, borderRadius: 1, opacity: 0.45 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
});

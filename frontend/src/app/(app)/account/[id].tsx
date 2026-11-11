import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Account, BlockRequest, CardOrder, Transaction, TransactionPage } from '@/api/types';
import { CardsSection } from '@/cards/cards-section';
import { ReviewBanner } from '@/cards/review-banner';
import { CurrencyDot } from '@/components/currency-dot';
import { PagedFooter, usePagedList } from '@/components/paged-list';
import { MonthHeader } from '@/history/month-header';
import { useMonthRows } from '@/history/use-month-rows';
import { AmountText } from '@/components/amount-text';
import { Text } from '@/components/text';
import { TransactionRow } from '@/components/transaction-row';
import { ActionRow, Body, Button, Card, Chip, ErrorText, Loading, SectionTitle, TextField } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { saveText } from '@/lib/save-text';

const PAGE_SIZE = 20;
// Fake money that matches the account's currency: $100, 10,000 rubles, or 200,000,000 rials (20 million toman). Minor units.
const DEMO_DEPOSITS: Record<string, number> = { USD: 10_000, RUB: 1_000_000, IRR: 200_000_000 };

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<CardOrder[]>([]);
  const [blocks, setBlocks] = useState<BlockRequest[]>([]);
  const [version, setVersion] = useState(0); // bumped to make the cards list reload after a block decision
  const [unblocking, setUnblocking] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState<'deposit' | 'default' | 'export' | 'unblock' | null>(null);
  const router = useRouter();
  // Older transactions: loaded as you scroll (and by themselves while the screen is not full), and they stop on an empty page.
  const paging = usePagedList<Transaction>((cursor) => api<TransactionPage>(`/accounts/${id}/transactions?limit=${PAGE_SIZE}&before=${cursor}`), account !== null);
  const resetPaging = paging.reset;

  // First page: the account itself plus its newest transactions, fetched in parallel.
  const fetchFirst = useCallback(
    () =>
      Promise.all([
        api<Account>(`/accounts/${id}`),
        api<TransactionPage>(`/accounts/${id}/transactions?limit=${PAGE_SIZE}`),
        api<CardOrder[]>(`/accounts/${id}/card-orders`),
        api<BlockRequest[]>(`/accounts/${id}/block-requests`),
      ]),
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchFirst()
        .then(([acc, page, ord, blk]) => {
          if (!active) return;
          setAccount(acc);
          setOrders(ord);
          setBlocks(blk);
          resetPaging(page.items, page.next_cursor);
          setError(null);
        })
        .catch((e) => active && setError(describe(e, 'errors.loadData')));
      return () => {
        active = false;
      };
    }, [fetchFirst, describe, resetPaging]),
  );

  const reload = useCallback(async () => {
    try {
      const [acc, page, ord, blk] = await fetchFirst();
      setAccount(acc);
      setOrders(ord);
      setBlocks(blk);
      resetPaging(page.items, page.next_cursor);
      setError(null);
    } catch (e) {
      setError(describe(e, 'errors.loadData'));
    }
  }, [fetchFirst, describe, resetPaging]);

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  async function run(kind: 'deposit' | 'default' | 'export', work: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(describe(e, kind === 'export' ? 'errors.generic' : 'errors.generic'));
    } finally {
      setBusy(null);
    }
  }

  const addDemoMoney = () =>
    run('deposit', async () => {
      await api<Account>(`/accounts/${id}/deposit`, { method: 'POST', body: { amount: DEMO_DEPOSITS[account?.currency ?? 'USD'] ?? DEMO_DEPOSITS.USD } });
      await reload();
    });

  const makeDefault = () => run('default', async () => setAccount(await api<Account>(`/accounts/${id}/default`, { method: 'PUT' })));

  const exportStatement = () =>
    run('export', async () => {
      if (!account) return;
      const csv = await api<string>(`/accounts/${id}/statement.csv`, { responseType: 'text' });
      await saveText(`statement-${account.account_number.slice(-4)}.csv`, csv);
    });

  async function unblock() {
    setBusy('unblock');
    setError(null);
    try {
      await api<void>(`/accounts/${id}/unblock`, { method: 'POST', body: { pin } });
      setPin('');
      setUnblocking(false);
      await reload();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  const decided = async () => {
    await reload();
    setVersion((v) => v + 1);
  };

  const { rows, toggle } = useMonthRows(paging.items, (row) => row.id);
  const blocked = account?.status === 'frozen';
  const pendingOrder = orders.find((o) => o.status === 'pending');
  const accountReview = blocks.find((b) => b.status === 'pending_review' && b.target === 'account');
  const cardReviews = blocks.filter((b) => b.status === 'pending_review' && b.target === 'card');

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.content}
        {...paging.listProps}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, marginBottom: Spacing.two }}>
            {account ? (
              <View style={[styles.hero, { backgroundColor: theme.hero }]}>
                <View style={[styles.coin, { backgroundColor: theme.gold }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <CurrencyDot code={account.currency} size={24} />
                  <Text style={{ color: theme.onHeroMuted, fontSize: 14, fontWeight: '600' }}>
                    {account.currency} · {t(`accountTypes.${account.type}`)} · {fmt.num(`•••• ${account.account_number.slice(-4)}`)}
                  </Text>
                </View>
                <AmountText text={fmt.money(account.balance, account.currency)} maxSize={36} minSize={16} color={theme.onHero} />
                {account.is_default ? (
                  <View style={{ marginTop: Spacing.two }}>
                    <Chip>{t('home.phonePayments')}</Chip>
                  </View>
                ) : null}
              </View>
            ) : (
              error ? null : <Loading />
            )}
            <ErrorText>{error}</ErrorText>
            {account && (
              <View style={{ gap: Spacing.two }}>
                <ActionRow title={t('account.addDemo', { amount: fmt.money(DEMO_DEPOSITS[account.currency] ?? DEMO_DEPOSITS.USD, account.currency) })} icon="add-circle-outline" onPress={addDemoMoney} loading={busy === 'deposit'} />
                <ActionRow title={t('account.exportStatement')} icon="download-outline" onPress={exportStatement} loading={busy === 'export'} />
                {!account.is_default && <ActionRow title={t('account.receiveHere')} icon="call-outline" onPress={makeDefault} loading={busy === 'default'} />}
              </View>
            )}
            {blocked ? (
              <Card>
                <View style={{ gap: Spacing.two }}>
                  <Chip tone="danger">{t('cardServices.blockedBanner')}</Chip>
                  <Body muted>{t('cardServices.blockedBannerSub')}</Body>
                  {unblocking ? (
                    <>
                      <Body>{t('cardServices.unblockHint')}</Body>
                      <TextField label={t('cardServices.pinLabel')} value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" maxLength={8} />
                      <Button title={t('cardServices.unblockConfirm')} icon="lock-open-outline" onPress={unblock} loading={busy === 'unblock'} disabled={pin.length < 4} />
                    </>
                  ) : (
                    <Button title={t('cardServices.unblock')} icon="lock-open-outline" variant="secondary" onPress={() => setUnblocking(true)} />
                  )}
                </View>
              </Card>
            ) : null}
            {accountReview ? <ReviewBanner request={accountReview} onDecided={decided} /> : null}
            {account ? <CardsSection accountId={account.id} currency={account.currency} onSpent={reload} reviews={cardReviews} reloadKey={version} onDecided={decided} /> : null}
            {account ? (
              <View style={{ gap: Spacing.two }}>
                <SectionTitle>{t('cardServices.section')}</SectionTitle>
                {pendingOrder ? (
                  <ActionRow title={t('cardServices.orderPending')} sub={t('cardServices.orderPendingSub', { date: fmt.date(pendingOrder.created_at), branch: t(`branches.items.${pendingOrder.branch_id}.name`) })} icon="time-outline" onPress={() => router.push({ pathname: '/card-order', params: { id: account.id } })} />
                ) : (
                  <ActionRow title={t('cardServices.orderCard')} sub={t('cardServices.orderCardSub')} icon="card-outline" onPress={() => router.push({ pathname: '/card-order', params: { id: account.id } })} disabled={blocked} />
                )}
                {!blocked && !accountReview ? (
                  <ActionRow title={t('cardServices.blockAccount')} sub={t('cardServices.blockAccountSub')} icon="lock-closed-outline" onPress={() => router.push({ pathname: '/block', params: { id: account.id } })} />
                ) : null}
              </View>
            ) : null}
            <SectionTitle>{t('account.transactions')}</SectionTitle>
            {account ? <ActionRow title={t('cardServices.fullHistory')} sub={t('cardServices.fullHistorySub')} icon="filter-outline" onPress={() => router.push({ pathname: '/account-history', params: { id: account.id } })} /> : null}
          </View>
        }
        renderItem={({ item: r }) => (r.type === 'header' ? <MonthHeader label={r.label} count={r.count} open={r.open} onPress={() => toggle(r.month)} /> : <TransactionRow row={r.item} currency={account?.currency} />)}
        ListEmptyComponent={account ? <Body muted>{t('account.none')}</Body> : undefined}
        ListFooterComponent={<PagedFooter paging={paging} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  hero: { borderRadius: 28, padding: Spacing.four, overflow: 'hidden' },
  coin: { position: 'absolute', end: -40, top: -50, width: 150, height: 150, borderRadius: 75, opacity: 0.22 },
});

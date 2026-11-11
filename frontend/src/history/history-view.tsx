import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Account, CardListItem, HistoryItem, HistoryPage, HistoryTotals } from '@/api/types';
import { DateField } from '@/components/date-field';
import { CurrencyDot } from '@/components/currency-dot';
import { Select } from '@/components/select';
import { AmountText } from '@/components/amount-text';
import { TransactionRow } from '@/components/transaction-row';
import { PagedFooter, usePagedList } from '@/components/paged-list';
import { Body, Caption, Card, ErrorText, Loading, Segmented, Title } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { MonthHeader } from '@/history/month-header';
import { useMonthRows } from '@/history/use-month-rows';
import { historyQuery, presetRange, type PeriodKey } from '@/history/period';
import { todayIso } from '@/lib/calendar';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

const PAGE_SIZE = 25;
const fetchAccounts = () => api<Account[]>('/accounts');
const fetchCards = () => api<CardListItem[]>('/cards');

type Loaded = { key: string; page: HistoryPage };
type Flow = 'all' | 'in' | 'out';

/**
 * The statement screen. With no `accountId` it is the History tab (every account and card, chosen from a select box);
 * with one it is that account's own history: same period and in/out filters, no account choice.
 */
export function HistoryView({ accountId }: { accountId?: string }) {
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { data: accounts } = useFocusData(fetchAccounts);
  const { data: cards } = useFocusData(fetchCards);

  // What to show: "all", an account id, or a card id (prefixed so the two can never collide).
  const [chosen, setSource] = useState('all');
  const source = accountId ? `a:${accountId}` : chosen;
  const [period, setPeriod] = useState<PeriodKey>('days30');
  const [customFrom, setCustomFrom] = useState<string | undefined>();
  const [customTo, setCustomTo] = useState<string | undefined>();
  const [flow, setFlow] = useState<Flow>('all');

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const range = period === 'custom' ? { from: customFrom, to: customTo } : presetRange(period);
  const filter = useMemo(
    () => ({
      accountId: source.startsWith('a:') ? source.slice(2) : undefined,
      cardId: source.startsWith('c:') ? source.slice(2) : undefined,
      range,
      flow: flow === 'all' ? undefined : flow,
      limit: PAGE_SIZE,
    }),
    // `range` is rebuilt every render, so depend on its two ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, range.from, range.to, flow],
  );
  const key = historyQuery(filter);
  // "Loading" is derived: the data on screen belongs to a different filter than the one selected.
  const loading = loaded?.key !== key;

  const fetchFirst = useCallback(() => api<HistoryPage>(`/history?${key}`).then((page) => ({ key, page })), [key]);
  const current = loaded?.key === key ? loaded.page : null;
  // Older pages: loaded as you scroll (and by themselves while the screen is not full). Held back while the first page of a new filter is on its way.
  const paging = usePagedList<HistoryItem>((cursor) => api<HistoryPage>(`/history?${historyQuery({ ...filter, before: cursor })}`), current !== null);
  const resetPaging = paging.reset;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchFirst()
        .then((result) => {
          if (!active) return;
          setLoaded(result);
          resetPaging(result.page.items, result.page.next_cursor);
          setError(null);
        })
        .catch((e) => active && setError(describe(e, 'errors.loadData')));
      return () => {
        active = false;
      };
    }, [fetchFirst, describe, resetPaging]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      const result = await fetchFirst();
      setLoaded(result);
      resetPaging(result.page.items, result.page.next_cursor);
      setError(null);
    } catch (e) {
      setError(describe(e, 'errors.loadData'));
    } finally {
      setRefreshing(false);
    }
  }

  const items = current ? paging.items : [];
  const { rows, toggle } = useMonthRows(items, (row) => row.id);

  // Choosing "Custom" starts from the range that was showing, so the calendar opens where the user already is.
  function choosePeriod(next: PeriodKey) {
    if (next === 'custom' && period !== 'custom') {
      const current = presetRange(period);
      setCustomFrom(current.from);
      setCustomTo(current.to);
    }
    setPeriod(next);
  }
  // The two ends can never cross: moving one past the other drags the other along.
  function pickFrom(iso: string | undefined) {
    setCustomFrom(iso);
    if (iso && customTo && customTo < iso) setCustomTo(iso);
  }
  function pickTo(iso: string | undefined) {
    setCustomTo(iso);
    if (iso && customFrom && customFrom > iso) setCustomFrom(iso);
  }

  const accountLabel = (currency: string, type: Account['type'], number: string) =>
    t('history.accountLabel', { currency, type: t(`accountTypes.${type}`), last4: fmt.num(number.slice(-4)) });
  const sourceOptions = [
    { value: 'all', label: t('history.everything') },
    ...(accounts ?? []).map((a) => ({ value: `a:${a.id}`, label: accountLabel(a.currency, a.type, a.account_number), leading: <CurrencyDot code={a.currency} size={26} />, group: t('history.accountsGroup') })),
    ...(cards ?? []).map((c) => ({ value: `c:${c.id}`, label: t('history.cardLabel', { last4: fmt.num(c.last4) }), group: t('history.cardsGroup') })),
  ];
  const periodOptions: { value: string; label: string }[] = [
    { value: 'today', label: t('history.today') },
    { value: 'days7', label: t('history.days7') },
    { value: 'days30', label: t('history.days30') },
    { value: 'days90', label: t('history.days90') },
    { value: 'thisYear', label: t('history.thisYear') },
    { value: 'all', label: t('history.allTime') },
    { value: 'custom', label: t('history.custom') },
  ];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={accountId ? ['left', 'right', 'bottom'] : undefined}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.content}
        {...paging.listProps}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, marginBottom: Spacing.two }}>
            {accountId ? null : <Title>{t('tabs.history')}</Title>}

            <Card>
              <View style={{ gap: Spacing.three }}>
                {accountId ? null : <Select label={t('history.show')} icon="wallet-outline" value={source} options={sourceOptions} onChange={setSource} />}
                <Select label={t('history.period')} icon="calendar-outline" value={period} options={periodOptions} onChange={(v) => choosePeriod(v as PeriodKey)} />
                {period === 'custom' ? (
                  <View style={styles.dates}>
                    <DateField label={t('history.from')} value={customFrom} onChange={pickFrom} max={todayIso()} />
                    <DateField label={t('history.to')} value={customTo} onChange={pickTo} max={todayIso()} />
                  </View>
                ) : null}
              </View>
            </Card>

            <Segmented<Flow>
              value={flow}
              onChange={setFlow}
              options={[
                { value: 'all', label: t('history.flowAll') },
                { value: 'in', label: t('history.flowIn') },
                { value: 'out', label: t('history.flowOut') },
              ]}
            />

            {current ? <Totals totals={current.totals} /> : null}
            <ErrorText>{error}</ErrorText>
          </View>
        }
        renderItem={({ item: r }) =>
          r.type === 'header' ? (
            <MonthHeader label={r.label} count={r.count} open={r.open} onPress={() => toggle(r.month)} />
          ) : (
            <TransactionRow row={r.item} currency={r.item.currency} extra={source === 'all' || source.startsWith('c:') ? accountLabel(r.item.currency, r.item.account_type, r.item.account_number) : undefined} />
          )
        }
        ListEmptyComponent={loading ? (error ? undefined : <Loading />) : error ? undefined : <Body muted>{t('history.empty')}</Body>}
        ListFooterComponent={<PagedFooter paging={paging} />}
      />
    </SafeAreaView>
  );
}

function Totals({ totals }: { totals: HistoryTotals }) {
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  return (
    <Card>
      {/* One block per currency: $5 and 5 rubles cannot be added together. */}
      <View style={{ gap: Spacing.three }}>
        {totals.by_currency.map((c) => (
          <View key={c.currency} style={styles.totals}>
            <View style={{ flex: 1, gap: 2 }}>
              <Caption>{t('history.income')}</Caption>
              <AmountText text={fmt.moneySigned(c.income, c.currency)} maxSize={20} minSize={11} color={theme.success} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Caption>{t('history.spending')}</Caption>
              <AmountText text={fmt.money(c.spending, c.currency)} maxSize={20} minSize={11} color={theme.text} />
            </View>
          </View>
        ))}
      </View>
      <View style={{ marginTop: Spacing.two, gap: 2 }}>
        <Caption>{t('history.count', { count: totals.count })}</Caption>
        <Caption>{t('history.totalsNote')}</Caption>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  totals: { flexDirection: 'row', gap: Spacing.three },
  dates: { flexDirection: 'row', gap: Spacing.two },
});

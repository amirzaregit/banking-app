import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { RatesResponse } from '@/api/types';
import { Text, TextInput } from '@/components/text';
import { AmountText } from '@/components/amount-text';
import { useKeyboardHeight } from '@/components/keyboard';
import { OptionSheet } from '@/components/select';
import { Caption, Card, ErrorText, SectionTitle } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { normalizeDigits } from '@/i18n/digits';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { convert, CURRENCIES, formatNumber, pairRate, parseAmountInput, type CurrencyCode } from '@/rates/convert';

const fetchRates = () => api<RatesResponse>('/rates');
const QUICK: Record<CurrencyCode, number[]> = { RUB: [100, 1000, 10000], IRR: [1_000_000, 10_000_000, 100_000_000], USD: [10, 100, 1000], AED: [100, 1000, 10000], EUR: [10, 100, 1000], CNY: [100, 1000, 10000], JPY: [1000, 10000, 100000] };

/** A currency calculator (prices only: nothing is exchanged). Pick ANY currency on each side; ruble and rial start selected. */
export default function Rates() {
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const { data, error, refreshing, refresh } = useFocusData(fetchRates);
  const [{ from, to }, setDir] = useState<{ from: CurrencyCode; to: CurrencyCode }>({ from: 'RUB', to: 'IRR' });
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);
  const keyboard = useKeyboardHeight(); // the app draws edge to edge, so leave room for the keyboard ourselves
  const [amountText, setAmountText] = useState('1000');

  // Choosing the currency that is already on the other side swaps the two, so both sides are never the same.
  const choose = (side: 'from' | 'to', code: CurrencyCode) =>
    setDir((d) => (code === (side === 'from' ? d.to : d.from) ? { from: d.to, to: d.from } : { ...d, [side]: code }));
  const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: `${c} · ${t(`rates.currencies.${c}`)}` }));
  const amount = parseAmountInput(amountText);
  const rates = data?.rates;
  const result = rates && amount !== null ? convert(amount, rates, from, to) : null;
  const resultText = result === null ? '—' : formatNumber(result, result >= 1000 ? 0 : 2);
  const forward = rates ? pairRate(rates, from, to) : null;
  const backward = rates ? pairRate(rates, to, from) : null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        ref={scroller}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: Spacing.four + keyboard }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}>
        <ErrorText>{error}</ErrorText>
        {data?.stale ? <ErrorText>{t('rates.stale')}</ErrorText> : null}

        {/* You send */}
        <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }]}>
          <Caption>{t('rates.send')}</Caption>
          <View style={styles.panelRow}>
            <TextInput
              value={amountText}
              onChangeText={(text) => setAmountText(normalizeDigits(text))}
              keyboardType="decimal-pad"
              accessibilityLabel={t('rates.amount')}
              placeholder="0"
              placeholderTextColor={theme.textSecondary}
              selectTextOnFocus
              // numeric input is always left-to-right
              style={[styles.amountInput, { color: theme.text, writingDirection: 'ltr', textAlign: 'left' }]}
            />
            <CurrencyBadge code={from} onPress={() => setPicking('from')} />
          </View>
          <View style={styles.quickRow}>
            {QUICK[from].map((q) => (
              <Pressable key={q} accessibilityRole="button" onPress={() => setAmountText(String(q))} style={[styles.quick, { borderColor: theme.border }]}>
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{fmt.num(formatNumber(q, 0))}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* swap button sits between the two panels */}
        <View style={styles.swapWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('rates.swap')}
            onPress={() => setDir(({ from: f, to: t2 }) => ({ from: t2, to: f }))}
            style={({ pressed }) => [styles.swap, { backgroundColor: theme.gold, borderColor: theme.background, opacity: pressed ? 0.85 : 1 }]}>
            <Ionicons name="swap-vertical" size={24} color={theme.onGold} />
          </Pressable>
        </View>

        {/* You get */}
        <View style={[styles.panel, { backgroundColor: theme.hero }]}>
          <Text style={{ color: theme.onHeroMuted, fontSize: 14, fontWeight: '600' }}>{t('rates.receive')}</Text>
          <View style={styles.panelRow}>
            <View style={{ flex: 1 }}>
              <AmountText text={fmt.num(resultText)} maxSize={34} minSize={14} color={theme.onHero} align="left" />
            </View>
            <CurrencyBadge code={to} onHero onPress={() => setPicking('to')} />
          </View>
        </View>

        {forward !== null && backward !== null ? (
          <Card>
            <View style={{ gap: Spacing.two }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{fmt.num(t('rates.oneEquals', { from, to, value: formatNumber(forward) }))}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{fmt.num(t('rates.oneEquals', { from: to, to: from, value: formatNumber(backward) }))}</Text>
            </View>
          </Card>
        ) : null}

        {data ? <Caption>{t('rates.updated', { date: fmt.date(data.updated_at) })}</Caption> : null}

        {rates ? (
          <View style={{ gap: Spacing.three }}>
            <SectionTitle>{t('rates.others')}</SectionTitle>
            {CURRENCIES.filter((c) => c !== 'RUB' && c !== 'IRR').map((code) => (
              <Card key={code} onPress={() => {
                  choose('from', code);
                  scroller.current?.scrollTo({ y: 0, animated: true }); // show it in the calculator
                }}>
                <View style={styles.otherRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{code}</Text>
                    <Caption>{t(`rates.currencies.${code}`)}</Caption>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {(['RUB', 'IRR'] as const).map((base) => {
                      const v = pairRate(rates, code, base);
                      return (
                        <Text key={base} style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>
                          {v === null ? '—' : fmt.num(`${formatNumber(v)} ${base}`)}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <OptionSheet
        visible={picking !== null}
        title={picking === 'to' ? t('rates.receive') : t('rates.send')}
        value={picking === 'to' ? to : from}
        options={currencyOptions}
        onSelect={(code) => picking && choose(picking, code as CurrencyCode)}
        onClose={() => setPicking(null)}
      />
    </SafeAreaView>
  );
}

function CurrencyBadge({ code, onHero, onPress }: { code: CurrencyCode; onHero?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${code} ${t(`rates.currencies.${code}`)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.badge, { backgroundColor: onHero ? 'rgba(255,255,255,0.14)' : theme.backgroundSelected, opacity: pressed ? 0.85 : 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ color: onHero ? theme.onHero : theme.text, fontSize: 16, fontWeight: '800' }}>{code}</Text>
        <Ionicons name="chevron-down" size={16} color={onHero ? theme.onHero : theme.textSecondary} />
      </View>
      <Text numberOfLines={1} style={{ color: onHero ? theme.onHeroMuted : theme.textSecondary, fontSize: 11 }}>{t(`rates.currencies.${code}`)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  panel: { borderRadius: 28, padding: Spacing.four, gap: Spacing.two },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  amountInput: { flex: 1, fontSize: 34, fontWeight: '800', paddingVertical: 4, minWidth: 0 },
  badge: { borderRadius: Radius.lg, paddingHorizontal: Spacing.three, paddingVertical: 8, alignItems: 'center', minWidth: 104, maxWidth: 130 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  quick: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  swapWrap: { alignItems: 'center', height: 0, zIndex: 2 },
  swap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 4, marginTop: -26 },
});

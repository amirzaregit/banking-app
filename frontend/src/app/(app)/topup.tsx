import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import type { Account } from '@/api/types';
import { Select } from '@/components/select';
import { Text } from '@/components/text';
import { Body, Button, Caption, ErrorText, FormScreen, SectionTitle, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { FilterChips } from '@/components/filter-chips';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { parseAmount, sanitizeAmountInput } from '@/lib/money';

const fetchAccounts = () => api<Account[]>('/accounts');
type Method = 'card' | 'transfer' | 'cash';
const METHODS: { id: Method; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'card', icon: 'card-outline' },
  { id: 'transfer', icon: 'swap-horizontal-outline' },
  { id: 'cash', icon: 'cash-outline' },
];
// Quick amounts in major units (about $50, $100 and $500 worth in each currency).
const QUICK: Record<string, string[]> = { USD: ['50', '100', '500'], RUB: ['5000', '10000', '50000'], IRR: ['100000000', '200000000', '1000000000'] };

/** Add money to an account from a card, a bank transfer or cash. (Demo: the money is simulated.) */
export default function TopUp() {
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { data: accounts, refresh } = useFocusData(fetchAccounts);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [method, setMethod] = useState<Method>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const active = (accounts ?? []).filter((a) => a.status === 'active');
  const account = active.find((a) => a.id === accountId) ?? active[0];
  const currency = account?.currency ?? 'USD';
  const amount = parseAmount(text, currency);

  async function topUp() {
    if (!account || amount === null) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api<Account>(`/accounts/${account.id}/topup`, { method: 'POST', body: { amount, method } });
      setDone(t('topup.done', { amount: fmt.money(amount, currency) }));
      setText('');
      refresh();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Body muted>{t('topup.intro')}</Body>
      {account ? (
        <Select
          label={t('topup.account')}
          icon="wallet-outline"
          value={account.id}
          options={active.map((a) => ({ value: a.id, label: `${t(`accountTypes.${a.type}`)} · ${a.currency} · ${fmt.money(a.balance, a.currency)}` }))}
          onChange={(v) => {
            setAccountId(v);
            setText('');
          }}
        />
      ) : null}

      <TextField
        label={`${t('topup.amount')} (${currency})`}
        value={text}
        onChangeText={(v) => setText(sanitizeAmountInput(v, currency))}
        grouped
        keyboardType="decimal-pad"
        placeholder={currency === 'IRR' ? '0' : '0.00'}
        style={{ fontSize: 26, fontWeight: '800' }}
      />
      <FilterChips options={(QUICK[currency] ?? QUICK.USD).map((q) => ({ value: q, label: fmt.num(q.replace(/\B(?=(\d{3})+(?!\d))/g, ',')) }))} value={text} onChange={setText} />

      <SectionTitle>{t('topup.method')}</SectionTitle>
      {METHODS.map((m) => {
        const selected = m.id === method;
        return (
          <Pressable
            key={m.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setMethod(m.id)}
            style={[styles.method, { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement, borderColor: selected ? theme.primary : theme.border }]}>
            <Ionicons name={m.icon} size={24} color={theme.primaryText} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{t(`topup.${m.id}`)}</Text>
              <Caption>{t(`topup.${m.id}Sub`)}</Caption>
            </View>
            <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? theme.primaryText : theme.textSecondary} />
          </Pressable>
        );
      })}

      <ErrorText>{error}</ErrorText>
      {done ? <Text style={{ color: theme.success, fontWeight: '700', fontSize: 15 }}>{done}</Text> : null}
      <Button title={amount !== null ? t('topup.action', { amount: fmt.money(amount, currency) }) : t('topup.amount')} icon="add-circle-outline" onPress={topUp} loading={busy} disabled={amount === null || !account} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  method: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 2, borderRadius: Radius.md, padding: Spacing.three },
});

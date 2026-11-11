import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Transaction } from '@/api/types';
import { AmountText } from '@/components/amount-text';
import { Text } from '@/components/text';
import { Caption, IconBadge } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

// The bank's own accounts have fixed numbers; the server labels them in English, so we label them ourselves.
const RESERVE = 'SYSTEM-RESERVE-';
const MERCHANTS = 'SYSTEM-MERCHANTS-'; // one per currency: SYSTEM-MERCHANTS-USD, -RUB, -IRR
const FX = 'SYSTEM-FX-'; // the bank's pool on the other side of every currency exchange

/** One line of a statement. Shared by the account page and the History tab; `extra` adds a small third line. Tapping it opens the transaction in full, with its receipt. */
export function TransactionRow({ row, currency = 'USD', extra }: { row: Transaction; currency?: string; extra?: string }) {
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const router = useRouter();
  const incoming = row.amount > 0;

  const counterparty =
    row.counterparty_account_number.startsWith(RESERVE) ? t('account.bank') : row.counterparty_account_number.startsWith(MERCHANTS) ? t('account.cardPayment') : row.counterparty_account_number.startsWith(FX) ? t('account.exchange') : row.counterparty_name;
  const note = row.description === 'Demo deposit' ? t('account.demoDeposit') : row.description === 'Currency exchange' ? t('account.exchange') : row.description?.startsWith('Top-up (') ? t(`account.topUp${row.description.slice(8, 9).toUpperCase()}${row.description.slice(9, -1)}`) : (row.description ?? (incoming ? t('account.received') : t('account.sent')));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/transaction', params: { id: String(row.id) } })}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
      <IconBadge name={incoming ? 'arrow-down-outline' : 'arrow-up-outline'} tone={incoming ? 'teal' : 'gold'} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{fmt.name(counterparty)}</Text>
        <Caption>
          {note} · {fmt.date(row.created_at)}
        </Caption>
        {extra ? <Caption>{extra}</Caption> : null}
      </View>
      <View style={{ maxWidth: '46%', minWidth: 64 }}>
        <AmountText text={fmt.moneySigned(row.amount, currency)} maxSize={16} minSize={10} color={incoming ? theme.success : theme.text} align="right" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
});

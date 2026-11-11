import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import type { TransactionDetail, TransactionKind } from '@/api/types';
import { AmountText } from '@/components/amount-text';
import { PdfCard } from '@/components/pdf-card';
import { Caption, Card, Chip, Detail, FormScreen, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { usePdfDocument } from '@/hooks/use-pdf-document';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import type { Lang } from '@/i18n';
import { formatDateTime } from '@/lib/date';
import { buildReceiptHtml, receiptFileName } from '@/transactions/receipt-document';

const ICONS: Record<TransactionKind, React.ComponentProps<typeof Ionicons>['name']> = {
  deposit: 'add-circle-outline',
  top_up: 'add-circle-outline',
  transfer: 'swap-horizontal-outline',
  gift: 'gift-outline',
  card_payment: 'card-outline',
  bill: 'receipt-outline',
  insurance: 'shield-checkmark-outline',
  exchange: 'repeat-outline',
};

/** One transaction in full, with its receipt as a PDF (view, save, share, print) in the language you pick. */
export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const { user } = useSession();
  const fetchDetail = useCallback(() => api<TransactionDetail>(`/transactions/${id}`), [id]);
  const { data: d, error } = useFocusData(fetchDetail);
  const [docLang, setDocLang] = useState<Lang>(lang);
  const holder = user?.full_name ?? '';
  const pdf = usePdfDocument(d ? { html: buildReceiptHtml(d, holder, docLang), fileName: receiptFileName(d), title: d.receipt_number } : null);

  if (!d) return <FormScreen><Loading error={error} /></FormScreen>;

  const incoming = d.amount > 0;
  const bankSide = d.counterparty_account_number.startsWith('SYSTEM-');
  const other = d.counterparty_account_number.startsWith('SYSTEM-RESERVE-')
    ? t('account.bank')
    : d.counterparty_account_number.startsWith('SYSTEM-MERCHANTS-')
      ? t('account.cardPayment')
      : d.counterparty_account_number.startsWith('SYSTEM-FX-')
        ? t('account.exchange')
        : fmt.name(d.counterparty_name);
  const mine = `${fmt.name(holder)} · ${fmt.num(`••${d.account_number.slice(-4)}`)}`;
  const theirs = bankSide ? other : `${other} · ${fmt.num(`••${d.counterparty_account_number.slice(-4)}`)}`;

  return (
    <FormScreen>
      <Card>
        <View style={{ gap: Spacing.three }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <Ionicons name={ICONS[d.kind]} size={28} color={theme.primaryText} />
            <View style={{ flex: 1 }}>
              <Caption>{t(`transaction.kinds.${d.kind}`)}</Caption>
            </View>
            <Chip tone="success">{t(`transaction.statuses.${d.status}`)}</Chip>
          </View>
          <AmountText text={fmt.moneySigned(d.amount, d.currency)} maxSize={38} minSize={18} color={incoming ? theme.success : theme.text} />
          <Detail label={t('transaction.date')} value={formatDateTime(d.created_at, lang)} />
          <Detail label={t('transaction.from')} value={incoming ? theirs : mine} />
          <Detail label={t('transaction.to')} value={incoming ? mine : theirs} />
          {d.exchange ? (
            <>
              <Detail label={t('transaction.rate')} value={`1 ${incoming ? d.exchange.other_currency : d.currency} = ${fmt.num((incoming ? 1 / d.exchange.rate : d.exchange.rate).toLocaleString('en-US', { maximumFractionDigits: 6 }))} ${incoming ? d.currency : d.exchange.other_currency}`} />
              <Detail label={incoming ? t('transaction.paidFrom') : t('transaction.received')} value={fmt.money(d.exchange.other_amount, d.exchange.other_currency)} />
            </>
          ) : null}
          {d.card_last4 ? <Detail label={t('transaction.card')} value={fmt.num(`••${d.card_last4}`)} /> : null}
          {d.description && !['deposit', 'top_up', 'exchange'].includes(d.kind) ? <Detail label={t('transaction.details')} value={d.description} /> : null}
          <Detail label={t('transaction.balanceAfter')} value={fmt.money(d.balance_after, d.currency)} />
          <Detail label={t('transaction.receiptNumber')} value={fmt.num(d.receipt_number)} />
        </View>
      </Card>

      <PdfCard pdf={pdf} title={t('transaction.receipt')} language={{ value: docLang, onChange: setDocLang }} />
    </FormScreen>
  );
}

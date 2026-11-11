import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { OpenAccountSheet } from '@/accounts/open-account-sheet';
import { api } from '@/api/client';
import type { Account, BillProvider, BillResult } from '@/api/types';
import { AmountText } from '@/components/amount-text';
import { ConfirmPayment } from '@/components/confirm-payment';
import { Select } from '@/components/select';
import { Text } from '@/components/text';
import { Body, Button, Caption, Card, ErrorText, FormScreen, Loading, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { parseAmount, sanitizeAmountInput } from '@/lib/money';

const fetchAccounts = () => api<Account[]>('/accounts');
const fetchProviders = () => api<BillProvider[]>('/bills/providers');

/** Pay one provider: the number to pay for, the amount, the account to pay from, then PIN (and a code for larger amounts). */
export default function PayBill() {
  const router = useRouter();
  const theme = useTheme();
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const { provider: providerId } = useLocalSearchParams<{ provider: string }>();
  const { data: providers, error: providersError } = useFocusData(fetchProviders);
  const { data: accounts, refresh } = useFocusData(fetchAccounts);
  const [reference, setReference] = useState('');
  const [text, setText] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<BillResult | null>(null);

  const provider = providers?.find((p) => p.id === providerId);
  if (!provider) return <FormScreen><Loading error={providersError} /></FormScreen>;

  const eligible = (accounts ?? []).filter((a) => a.status === 'active' && a.currency === provider.currency);
  const account = eligible.find((a) => a.id === accountId) ?? eligible.find((a) => a.is_default) ?? eligible[0];
  const amount = parseAmount(text, provider.currency);
  const needsReference = provider.reference !== 'none';
  const name = provider.names[lang];

  if (result) {
    return (
      <FormScreen>
        <View style={{ alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.four }}>
          <Ionicons name="checkmark-circle" size={72} color={theme.success} />
          <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>{t('bills.doneTitle')}</Text>
          <AmountText text={fmt.money(result.amount, result.currency)} maxSize={34} minSize={16} color={theme.text} align="center" />
          <Body muted>{t('bills.doneBody', { amount: fmt.money(result.amount, result.currency), provider: name })}</Body>
          {result.reference ? <Caption>{fmt.num(result.reference)}</Caption> : null}
        </View>
        <Button title={t('bills.another')} variant="secondary" onPress={() => router.replace('/bills')} />
        <Button title={t('bills.back')} onPress={() => router.navigate('/payments')} />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Card>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{name}</Text>
        <Caption>{t('bills.paidIn', { currency: provider.currency })}</Caption>
      </Card>

      {needsReference ? (
        <TextField
          label={provider.reference.startsWith('phone') ? t('bills.phone') : t('bills.account')}
          value={reference}
          onChangeText={setReference}
          keyboardType={provider.reference.startsWith('phone') ? 'phone-pad' : 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={provider.reference === 'phone_ru' ? '+7 912 345 67 89' : provider.reference === 'phone_ir' ? '0935 123 4567' : ''}
        />
      ) : null}

      <TextField label={`${t('bills.amount')} (${provider.currency})`} value={text} onChangeText={(v) => setText(sanitizeAmountInput(v, provider.currency))} grouped keyboardType="decimal-pad" placeholder={provider.currency === 'IRR' ? '0' : '0.00'} style={{ fontSize: 26, fontWeight: '800' }} />
      {text !== '' && amount === null ? <ErrorText>{t('amount.invalid')}</ErrorText> : null}

      {account ? (
        <Select label={t('bills.payFrom')} icon="wallet-outline" value={account.id} options={eligible.map((a) => ({ value: a.id, label: `${t(`accountTypes.${a.type}`)} · ${a.currency} · ${fmt.money(a.balance, a.currency)}` }))} onChange={setAccountId} />
      ) : accounts ? (
        <View style={{ gap: Spacing.three }}>
          <ErrorText>{t('bills.noAccount', { currency: provider.currency })}</ErrorText>
          <Button title={t('bills.openAccount')} icon="add-circle-outline" variant="secondary" onPress={() => setOpening(true)} />
        </View>
      ) : null}

      {account && amount !== null ? (
        <ConfirmPayment
          sig={`${provider.id}|${reference}|${account.id}|${amount}`}
          title={t('bills.pay', { amount: fmt.money(amount, provider.currency) })}
          fingerprintTitle={t('bills.pay', { amount: fmt.money(amount, provider.currency) })}
          disabled={needsReference && !reference.trim()}
          send={async (pin, otp, key) => {
            const done = await api<BillResult>('/bills/pay', {
              method: 'POST',
              headers: { 'Idempotency-Key': key },
              body: { provider_id: provider.id, reference: needsReference ? reference.trim() : undefined, from_account_id: account.id, amount, pin, ...(otp ? { otp } : {}) },
            });
            setResult(done);
            refresh();
          }}
          onDone={() => {}}
        />
      ) : null}
      <OpenAccountSheet visible={opening} onClose={() => setOpening(false)} onOpened={refresh} />
    </FormScreen>
  );
}

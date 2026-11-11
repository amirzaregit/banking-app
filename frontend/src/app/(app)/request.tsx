import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { api } from '@/api/client';
import type { Account, PaymentRequest } from '@/api/types';
import { Select } from '@/components/select';
import { Text } from '@/components/text';
import { ActionRow, Body, Button, Caption, Card, Chip, ErrorText, FormScreen, SectionTitle, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { parseAmount, sanitizeAmountInput } from '@/lib/money';

const fetchAccounts = () => api<Account[]>('/accounts');
const fetchRequests = () => api<PaymentRequest[]>('/requests');

/** "Please pay me": create a link and a QR code for a payment, with or without a fixed amount. */
export default function RequestPayment() {
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { data: accounts } = useFocusData(fetchAccounts);
  const { data: requests, refresh } = useFocusData(fetchRequests);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<PaymentRequest | null>(null);
  const [copied, setCopied] = useState(false);

  const active = (accounts ?? []).filter((a) => a.status === 'active');
  const account = active.find((a) => a.id === accountId) ?? active.find((a) => a.is_default) ?? active[0];
  const currency = account?.currency ?? 'USD';
  const amount = text.trim() === '' ? null : parseAmount(text, currency);
  const invalid = text.trim() !== '' && amount === null;

  async function create() {
    if (!account || invalid) return;
    setBusy('create');
    setError(null);
    try {
      const made = await api<PaymentRequest>('/requests', { method: 'POST', body: { account_id: account.id, amount: amount ?? undefined, note: note.trim() || undefined } });
      setShown(made);
      setText('');
      setNote('');
      refresh();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(r: PaymentRequest) {
    setBusy(r.id);
    try {
      const updated = await api<PaymentRequest>(`/requests/${r.id}/cancel`, { method: 'POST' });
      setShown((s) => (s?.id === r.id ? updated : s));
      refresh();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  const shareText = (r: PaymentRequest) => (r.amount !== null ? t('requests.shareWithAmount', { amount: fmt.money(r.amount, r.currency), link: r.link }) : t('requests.shareAny', { link: r.link }));

  async function share(r: PaymentRequest) {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(r.link).catch(() => {});
      setCopied(true);
      return;
    }
    await Share.share({ message: shareText(r) }).catch(() => {});
  }

  return (
    <FormScreen>
      {shown ? (
        <View style={{ gap: Spacing.three }}>
          <Card>
            <View style={{ alignItems: 'center', gap: Spacing.three }}>
              <Chip>{t(`requests.${shown.status}`)}</Chip>
              <View style={[styles.qr, { borderColor: theme.border }]}>
                <QRCode value={shown.link} size={210} color="#006D73" backgroundColor="#FFFFFF" />
              </View>
              <Text style={{ color: theme.text, fontSize: 26, fontWeight: '800' }}>{shown.amount !== null ? fmt.money(shown.amount, shown.currency) : t('requests.anyAmount')}</Text>
              {shown.note ? <Body muted>{shown.note}</Body> : null}
              <Caption>{t('requests.scanToPay')}</Caption>
              <Caption>{t('requests.validUntil', { date: fmt.date(shown.expires_at) })}</Caption>
              <Text selectable style={{ color: theme.textSecondary, fontSize: 12, writingDirection: 'ltr' }}>{shown.link}</Text>
            </View>
          </Card>
          <Button title={copied ? t('requests.copied') : Platform.OS === 'web' ? t('requests.copy') : t('requests.share')} icon={copied ? 'checkmark' : 'share-outline'} onPress={() => share(shown)} />
          {shown.status === 'open' ? <Button title={t('requests.cancel')} variant="secondary" icon="close-circle-outline" onPress={() => cancel(shown)} loading={busy === shown.id} /> : null}
          <Button
            title={t('requests.newOne')}
            variant="secondary"
            onPress={() => {
              setShown(null);
              setCopied(false);
            }}
          />
        </View>
      ) : (
        <View style={{ gap: Spacing.three }}>
          <Body muted>{t('requests.intro')}</Body>
          {account ? (
            <Select label={t('requests.account')} icon="wallet-outline" value={account.id} options={active.map((a) => ({ value: a.id, label: `${t(`accountTypes.${a.type}`)} · ${a.currency} · ${fmt.num(`•••• ${a.account_number.slice(-4)}`)}` }))} onChange={(v) => { setAccountId(v); setText(''); }} />
          ) : null}
          <TextField label={`${t('requests.amount')} (${currency})`} value={text} onChangeText={(v) => setText(sanitizeAmountInput(v, currency))} grouped keyboardType="decimal-pad" placeholder={currency === 'IRR' ? '0' : '0.00'} style={{ fontSize: 24, fontWeight: '800' }} />
          <Caption>{t('requests.amountHint')}</Caption>
          <TextField label={t('requests.note')} value={note} onChangeText={setNote} maxLength={140} />
          {invalid ? <ErrorText>{t('amount.invalid')}</ErrorText> : null}
          <ErrorText>{error}</ErrorText>
          <Button title={t('requests.create')} icon="qr-code-outline" onPress={create} loading={busy === 'create'} disabled={!account || invalid} />
        </View>
      )}

      <SectionTitle>{t('requests.mine')}</SectionTitle>
      {requests && requests.length === 0 ? <Body muted>{t('requests.none')}</Body> : null}
      {(requests ?? []).map((r) => (
        <ActionRow
          key={r.id}
          title={`${r.amount !== null ? fmt.money(r.amount, r.currency) : t('requests.anyAmount')} · ${t(`requests.${r.status}`)}`}
          sub={r.note ?? fmt.date(r.created_at)}
          icon={r.status === 'paid' ? 'checkmark-circle-outline' : 'qr-code-outline'}
          onPress={() => {
            setShown(r);
            setCopied(false);
          }}
        />
      ))}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  qr: { padding: Spacing.three, borderRadius: Radius.lg, borderWidth: 1, backgroundColor: '#FFFFFF' },
});

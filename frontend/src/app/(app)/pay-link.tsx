import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { api } from '@/api/client';
import type { RequestLookup } from '@/api/types';
import { Text } from '@/components/text';
import { Body, Button, Caption, Card, Chip, ErrorText, FormScreen, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { tokenFromText } from '@/payments/request-link';
import { useDraft } from '@/send/draft';

/** Pay someone's request: paste a payment link or code (or arrive here from the QR scanner). */
export default function PayLink() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { startPayment } = useDraft();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [text, setText] = useState(code ?? '');
  const [found, setFound] = useState<RequestLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function find(value = text) {
    const token = tokenFromText(value);
    if (!token) {
      setFound(null);
      return setError(t('scan.notRequest'));
    }
    setBusy(true);
    setError(null);
    try {
      setFound(await api<RequestLookup>(`/requests/lookup/${token}`));
    } catch (e) {
      setFound(null);
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  // Arriving from the scanner with a code: look it up straight away.
  useEffect(() => {
    if (!code) return;
    const token = tokenFromText(code);
    if (!token) return;
    let live = true;
    api<RequestLookup>(`/requests/lookup/${token}`)
      .then((r) => live && setFound(r))
      .catch((e) => live && setError(describe(e)));
    return () => {
      live = false;
    };
  }, [code, describe]);

  function pay() {
    if (!found) return;
    startPayment(
      { via: 'account', value: found.account_number, name: found.requester_name, hint: found.account_number, currency: found.currency },
      { requestToken: found.token, fixedAmount: found.amount, note: found.note ?? '' },
    );
    router.push('/send/amount');
  }

  const payable = found && found.status === 'open' && !found.is_mine;

  return (
    <FormScreen>
      <Body muted>{t('payLink.intro')}</Body>
      <TextField label={t('payLink.field')} value={text} onChangeText={(v) => { setText(v); setFound(null); setError(null); }} autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => find()} />
      <ErrorText>{error}</ErrorText>
      <View style={{ gap: Spacing.two }}>
        <Button title={t('payLink.find')} icon="search" onPress={() => find()} loading={busy} disabled={!text.trim()} />
        <Button title={t('payLink.scan')} icon="scan-outline" variant="secondary" onPress={() => router.push('/scan')} />
      </View>

      {found ? (
        <Card>
          <View style={{ gap: Spacing.two }}>
            <Caption>{t('payLink.from')}</Caption>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{t('payLink.asks', { name: fmt.name(found.requester_name) })}</Text>
            <Text style={{ color: theme.text, fontSize: 30, fontWeight: '800' }}>{found.amount !== null ? fmt.money(found.amount, found.currency) : t('payLink.youChoose')}</Text>
            {found.note ? <Body muted>{found.note}</Body> : null}
            {found.status !== 'open' ? <Chip tone="danger">{t(`requests.${found.status}`)}</Chip> : null}
            {found.is_mine ? <ErrorText>{t('payLink.mine')}</ErrorText> : null}
          </View>
        </Card>
      ) : null}
      {payable ? <Button title={t('payLink.continue')} icon="arrow-forward" onPress={pay} /> : null}
    </FormScreen>
  );
}

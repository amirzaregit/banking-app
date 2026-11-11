import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AmountText } from '@/components/amount-text';
import { Text } from '@/components/text';
import { Body, Button, Caption, Card, ErrorText, Page } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { authenticate, biometricState, failureKey, type BiometricState } from '@/security/biometrics';
import { enableBioPay, getBioPayEnabled } from '@/security/prefs';
import { useDraft } from '@/send/draft';
import { GiftCard, isGiftDesign } from '@/components/gift-card';

export default function Done() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const { draft, reset } = useDraft();
  const result = draft.result;

  const [bio, setBio] = useState<BiometricState>('unavailable');
  const [alreadyOn, setAlreadyOn] = useState(true); // assume on until we know, so the offer never flashes
  const [justEnabled, setJustEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      biometricState().then((s) => active && setBio(s));
      getBioPayEnabled().then((on) => active && setAlreadyOn(on));
      return () => {
        active = false;
      };
    }, []),
  );

  if (!result) return <Redirect href="/" />;

  // Offer fingerprint payments once: the phone can do it, it is not on yet, and we hold the PIN
  // that the server JUST accepted (so we know it is the right one).
  const offer = bio === 'ready' && !alreadyOn && !justEnabled && draft.usedPin !== null;

  async function enableFingerprint() {
    if (!draft.usedPin) return;
    setBusy(true);
    setMessage(null);
    const check = await authenticate(t('done.offerPrompt'));
    if (check.ok) {
      await enableBioPay(draft.usedPin);
      setJustEnabled(true);
    } else if (check.reason !== 'cancelled') {
      setMessage(t(failureKey(check.reason)));
    }
    setBusy(false);
  }

  function finish() {
    reset(); // also forgets the PIN held in memory
    router.dismissTo('/'); // pop the whole send flow and land on Home, where the new balance is
  }

  return (
    <Page>
      <View style={{ alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.backgroundSelected, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark-circle" size={72} color={theme.success} />
        </View>
        <AmountText text={fmt.money(result.amount, result.currency)} maxSize={36} minSize={16} color={theme.text} align="center" />
        <Body>{t('done.sentTo', { name: result.recipient_name })}</Body>
      </View>

      {isGiftDesign(result.gift_design) ? <GiftCard design={result.gift_design} message={result.description ?? ''} compact /> : null}
      <Card>
        {result.description && !result.gift_design ? <Caption>“{result.description}”</Caption> : null}
        <Caption>{t('done.newBalance')}</Caption>
        <AmountText text={fmt.money(result.new_balance, result.currency)} maxSize={22} minSize={13} color={theme.text} align="center" />
      </Card>

      {offer ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <Ionicons name="finger-print" size={36} color={theme.primaryText} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{t('done.offerTitle')}</Text>
              <Caption>{t('done.offerBody')}</Caption>
            </View>
          </View>
          <ErrorText>{message}</ErrorText>
          <View style={{ marginTop: Spacing.two }}>
            <Button title={t('done.offerButton')} icon="finger-print" variant="secondary" onPress={enableFingerprint} loading={busy} />
          </View>
        </Card>
      ) : null}
      {justEnabled ? (
        <Text accessibilityRole="alert" style={{ color: theme.success, fontWeight: '700', textAlign: 'center' }}>
          {t('done.offerEnabled')}
        </Text>
      ) : null}

      <Button title={t('common.done')} onPress={finish} />
    </Page>
  );
}

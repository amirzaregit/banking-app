import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { api, ApiError } from '@/api/client';
import type { Account, TransferResult } from '@/api/types';
import { useSession } from '@/auth/session';
import { AmountText } from '@/components/amount-text';
import { Text } from '@/components/text';
import { PinEntry } from '@/components/pin-entry';
import { Body, Button, Caption, Card, ErrorText, Page, Strong, TextLink } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { randomUUID } from '@/lib/uuid';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { authenticate, failureKey } from '@/security/biometrics';
import { isCompletePin } from '@/security/pin-rules';
import { disableBioPay, getBioPayEnabled, getStoredPin } from '@/security/prefs';
import { useDraft } from '@/send/draft';
import { GiftCard, isGiftDesign } from '@/components/gift-card';

const fetchAccounts = () => api<Account[]>('/accounts');

type Step = 'confirm' | 'code';

export default function Review() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { user } = useSession();
  const { draft, update } = useDraft();
  const { data: accounts } = useFocusData(fetchAccounts);

  const [step, setStep] = useState<Step>('confirm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  // The PIN we used, kept in memory ONLY while this screen is open, so the code step can reuse it.
  const [confirmedPin, setConfirmedPin] = useState<string | null>(null);
  const [bioReady, setBioReady] = useState(false); // fingerprint payments on, with a stored PIN
  const [typeInstead, setTypeInstead] = useState(false);

  // Created ONCE when this screen opens and reused on EVERY attempt: wrong PIN, code step,
  // resend, a dropped connection. The server therefore pays at most once for this screen.
  // Going back and changing the amount opens a NEW review screen, so a NEW key.
  const [idempotencyKey] = useState(() => randomUUID());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getBioPayEnabled().then((on) => active && setBioReady(on));
      return () => {
        active = false;
      };
    }, []),
  );

  const { recipient, fromAccountId, amountCents, note } = draft;
  if (!recipient || !fromAccountId || !amountCents) return <Redirect href="/transfer" />;

  const from = accounts?.find((a) => a.id === fromAccountId);
  const useFingerprint = bioReady && !typeInstead;
  const fromLabel = from ? t('amount.accountOption', { type: t(`accountTypes.${from.type}`), last4: from.account_number.slice(-4) }) : '…';

  async function submit(pinValue: string, otp?: string) {
    if (!recipient || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await api<TransferResult>('/transfers', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          from_account_id: fromAccountId,
          amount: amountCents,
          description: note || undefined,
          ...(draft.gift ? { gift_design: draft.gift.design } : {}),
          ...(draft.requestToken ? { request_token: draft.requestToken } : {}),
          pin: pinValue,
          ...(otp ? { otp } : {}),
          ...(recipient.via === 'phone' ? { to_phone: recipient.value } : { to_account_number: recipient.value }),
        },
      });
      setConfirmedPin(null);
      update({ result, usedPin: pinValue }); // the receipt screen may offer to remember it behind the fingerprint
      router.replace('/send/done');
    } catch (e) {
      onFailure(e);
    }
  }

  /** React to the server's machine-readable error CODE, never to its wording. */
  function onFailure(e: unknown) {
    setBusy(false);
    const message = describe(e);
    if (!(e instanceof ApiError)) return setError(message);

    switch (e.code) {
      case 'otp_required': // a big payment: the server texted a code
        setStep('code');
        setCode('');
        return setInfo(message);
      case 'otp_expired': // dead code: ask for a fresh one
        setCode('');
        return setError(message);
      case 'pin_invalid':
        setPin('');
        setConfirmedPin(null);
        setStep('confirm');
        if (useFingerprint) {
          // The PIN stored behind the fingerprint is wrong (it was changed elsewhere): forget it.
          disableBioPay();
          setBioReady(false);
        }
        return setError(message);
      default:
        return setError(message);
    }
  }

  async function onSend() {
    if (useFingerprint) {
      const result = await authenticate(t('review.fingerprintPrompt'));
      if (!result.ok) {
        if (result.reason !== 'cancelled') setError(t(failureKey(result.reason)));
        return;
      }
      const stored = await getStoredPin();
      if (!stored) {
        setTypeInstead(true);
        return setError(t('review.enterPin'));
      }
      setConfirmedPin(stored);
      return submit(stored);
    }
    if (!isCompletePin(pin)) return;
    setConfirmedPin(pin);
    return submit(pin);
  }

  const amountText = fmt.money(amountCents, from?.currency ?? 'USD');

  return (
    <Page>
      <Body muted>{t('review.check')}</Body>
      <View style={{ backgroundColor: theme.hero, borderRadius: 24, padding: Spacing.four }}>
        <Text style={{ color: theme.onHeroMuted, fontSize: 14, fontWeight: '600' }}>{t('review.amount')}</Text>
        <AmountText text={amountText} maxSize={38} minSize={16} color={theme.onHero} />
      </View>
      {draft.gift && isGiftDesign(draft.gift.design) ? <GiftCard design={draft.gift.design} message={draft.gift.message} compact /> : null}
      <Card>
        <Detail label={t('review.to')} value={fmt.name(recipient.name)} sub={fmt.num(recipient.hint)} />
        <Detail label={t('review.from')} value={fromLabel} />
        {note ? <Detail label={t('review.message')} value={note} /> : null}
      </Card>

      {step === 'confirm' ? (
        user?.has_pin ? (
          <View style={{ gap: Spacing.three }}>
            {!useFingerprint ? (
              <>
                <View style={{ gap: 2 }}>
            <Strong>{t('review.pinTitle')}</Strong>
            <Caption>{t('review.pinHint')}</Caption>
          </View>
                <PinEntry value={pin} onChange={setPin} error={!!error} disabled={busy} label={t('review.pin')} />
                <View style={{ alignItems: 'center' }}>
            <TextLink href="/security/pin">{t('review.forgotPin')}</TextLink>
          </View>
              </>
            ) : null}
            <ErrorText>{error}</ErrorText>
            <Button
              title={useFingerprint ? t('review.sendWithFingerprint', { amount: amountText }) : t('review.send', { amount: amountText })}
              icon={useFingerprint ? 'finger-print' : 'paper-plane'}
              onPress={onSend}
              loading={busy}
              disabled={!useFingerprint && !isCompletePin(pin)}
            />
            {useFingerprint ? <Button title={t('review.pinInstead')} variant="secondary" onPress={() => setTypeInstead(true)} /> : null}
          </View>
        ) : (
          <View style={{ gap: Spacing.three }}>
            <Card>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{t('review.setPinFirst')}</Text>
              <Caption>{t('review.setPinFirstSub')}</Caption>
            </Card>
            <Button title={t('review.setPin')} onPress={() => router.push('/security/pin')} />
          </View>
        )
      ) : (
        <View style={{ gap: Spacing.three }}>
          <Card>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{t('review.enterCode')}</Text>
            <Caption>{info ?? t('review.codeSent')}</Caption>
          </Card>
          <PinEntry value={code} onChange={setCode} secure={false} error={!!error} disabled={busy} label={t('review.codeLabel')} />
          <ErrorText>{error}</ErrorText>
          <Button
            title={t('review.confirmAndSend', { amount: amountText })}
            onPress={() => confirmedPin && submit(confirmedPin, code)}
            loading={busy}
            disabled={!isCompletePin(code) || !confirmedPin}
          />
          <Button title={t('review.newCode')} variant="secondary" onPress={() => confirmedPin && submit(confirmedPin)} />
          <Button title={t('review.openInbox')} variant="secondary" onPress={() => router.push('/security/messages')} />
        </View>
      )}
    </Page>
  );
}

function Detail({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const theme = useTheme();
  return (
    <View style={{ paddingVertical: Spacing.two, gap: 2 }}>
      <Caption>{label}</Caption>
      <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>{value}</Text>
      {sub ? <Caption>{sub}</Caption> : null}
    </View>
  );
}

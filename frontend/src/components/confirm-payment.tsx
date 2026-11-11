import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api/client';
import { useSession } from '@/auth/session';
import { Text } from '@/components/text';
import { PinEntry } from '@/components/pin-entry';
import { Button, Caption, Card, ErrorText, Strong, TextLink } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { randomUUID } from '@/lib/uuid';
import { useErrors } from '@/i18n/errors';
import { useI18n } from '@/i18n/provider';
import { authenticate, failureKey } from '@/security/biometrics';
import { isCompletePin } from '@/security/pin-rules';
import { disableBioPay, getBioPayEnabled, getStoredPin } from '@/security/prefs';

/**
 * The "prove it is you" part of a payment, in one piece: PIN (or fingerprint), then a one-time SMS code for larger
 * amounts. `send` makes the request with the PIN and code; `sig` describes the exact payment, so the same payment
 * keeps ONE idempotency key across retries (a dropped connection can never pay twice) and a changed one gets a new key.
 */
export function ConfirmPayment({
  sig,
  title,
  fingerprintTitle,
  disabled,
  send,
  onDone,
}: {
  sig: string;
  title: string;
  fingerprintTitle: string;
  disabled?: boolean;
  send: (pin: string, otp: string | undefined, idempotencyKey: string) => Promise<void>;
  onDone: () => void;
}) {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const describe = useErrors();
  const { user } = useSession();
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'confirm' | 'code'>('confirm');
  const [confirmedPin, setConfirmedPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [bioReady, setBioReady] = useState(false);
  const [typeInstead, setTypeInstead] = useState(false);
  const attempt = useRef<{ sig: string; key: string } | null>(null);

  useEffect(() => {
    let active = true;
    getBioPayEnabled().then((on) => active && setBioReady(on));
    return () => {
      active = false;
    };
  }, []);

  const useFingerprint = bioReady && !typeInstead;

  async function submit(pinValue: string, otp?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { sig, key: randomUUID() };
    try {
      await send(pinValue, otp, attempt.current.key);
      setConfirmedPin(null);
      onDone();
    } catch (e) {
      const message = describe(e);
      if (!(e instanceof ApiError)) setError(message);
      else if (e.code === 'otp_required') {
        setStep('code');
        setCode('');
        setInfo(message);
      } else if (e.code === 'pin_invalid') {
        setPin('');
        setConfirmedPin(null);
        setStep('confirm');
        if (useFingerprint) {
          disableBioPay();
          setBioReady(false);
        }
        setError(message);
      } else {
        if (e.code === 'otp_expired') setCode('');
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (useFingerprint) {
      const r = await authenticate(t('review.fingerprintPrompt'));
      if (!r.ok) {
        if (r.reason !== 'cancelled') setError(t(failureKey(r.reason)));
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

  if (!user?.has_pin) {
    return (
      <View style={{ gap: Spacing.three }}>
        <Card>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{t('review.setPinFirst')}</Text>
          <Caption>{t('review.setPinFirstSub')}</Caption>
        </Card>
        <Button title={t('review.setPin')} onPress={() => router.push('/security/pin')} />
      </View>
    );
  }

  if (step === 'code') {
    return (
      <View style={{ gap: Spacing.three }}>
        <Card>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{t('review.enterCode')}</Text>
          <Caption>{info ?? t('review.codeSent')}</Caption>
        </Card>
        <PinEntry value={code} onChange={setCode} secure={false} error={!!error} disabled={busy} label={t('review.codeLabel')} />
        <ErrorText>{error}</ErrorText>
        <Button title={title} onPress={() => confirmedPin && submit(confirmedPin, code)} loading={busy} disabled={!isCompletePin(code) || !confirmedPin} />
        <Button title={t('review.newCode')} variant="secondary" onPress={() => confirmedPin && submit(confirmedPin)} />
        <Button title={t('review.openInbox')} variant="secondary" onPress={() => router.push('/security/messages')} />
      </View>
    );
  }

  return (
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
      <Button title={useFingerprint ? fingerprintTitle : title} icon={useFingerprint ? 'finger-print' : 'checkmark-circle-outline'} onPress={onConfirm} loading={busy} disabled={disabled || (!useFingerprint && !isCompletePin(pin))} />
      {useFingerprint ? <Button title={t('review.pinInstead')} variant="secondary" onPress={() => setTypeInstead(true)} /> : null}
    </View>
  );
}

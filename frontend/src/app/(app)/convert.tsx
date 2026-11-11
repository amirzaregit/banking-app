import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { OpenAccountSheet } from '@/accounts/open-account-sheet';
import { api, ApiError } from '@/api/client';
import type { Account, ConversionQuote, ConversionResult } from '@/api/types';
import { useSession } from '@/auth/session';
import { AmountText } from '@/components/amount-text';
import { Select } from '@/components/select';
import { Text } from '@/components/text';
import { Body, Button, Caption, Card, ErrorText, FormScreen, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { randomUUID } from '@/lib/uuid';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { parseAmount, sanitizeAmountInput } from '@/lib/money';
import { formatNumber } from '@/rates/convert';
import { authenticate, failureKey } from '@/security/biometrics';
import { isCompletePin, sanitizePin } from '@/security/pin-rules';
import { disableBioPay, getBioPayEnabled, getStoredPin } from '@/security/prefs';

const fetchAccounts = () => api<Account[]>('/accounts');

type Loaded = { key: string; quote: ConversionQuote };

/** Real currency exchange: move money between YOUR OWN accounts of different currencies at the current rate. */
export default function Convert() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { user } = useSession();
  const { data: accounts, refresh } = useFocusData(fetchAccounts);

  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tick, setTick] = useState(0); // bump to fetch the quote again (the rate moved)
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'confirm' | 'code'>('confirm');
  const [confirmedPin, setConfirmedPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [bioReady, setBioReady] = useState(false);
  const [typeInstead, setTypeInstead] = useState(false);
  const [opening, setOpening] = useState(false);
  const attempt = useRef<{ sig: string; key: string } | null>(null); // one Idempotency-Key per exact conversion

  useEffect(() => {
    let active = true;
    getBioPayEnabled().then((on) => active && setBioReady(on));
    return () => {
      active = false;
    };
  }, []);

  const active = (accounts ?? []).filter((a) => a.status === 'active');
  const from = active.find((a) => a.id === fromId) ?? active[0];
  const targets = active.filter((a) => a.currency !== from?.currency);
  const to = targets.find((a) => a.id === toId) ?? targets[0];
  const amount = from ? parseAmount(amountText, from.currency) : null;
  const tooMuch = amount !== null && from !== undefined && amount > from.balance;
  const quoteKey = from && to && amount !== null && !tooMuch ? `${from.id}|${to.id}|${amount}|${tick}` : null;
  const quote = loaded && loaded.key === quoteKey ? loaded.quote : null;
  const quoting = quoteKey !== null && quote === null && !error;

  // Ask the server for the rate shortly after the user stops typing. State is only set inside the callbacks.
  useEffect(() => {
    if (!quoteKey || !from || !to || amount === null) return;
    let live = true;
    const timer = setTimeout(() => {
      api<ConversionQuote>(`/conversions/quote?from_account_id=${from.id}&to_account_id=${to.id}&amount=${amount}`)
        .then((q) => {
          if (!live) return;
          setLoaded({ key: quoteKey, quote: q });
          setError(null);
        })
        .catch((e) => live && setError(describe(e)));
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // quoteKey already contains from, to, amount and the refresh tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, describe]);

  const useFingerprint = bioReady && !typeInstead;

  async function submit(pinValue: string, otp?: string) {
    if (!from || !to || !quote || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const sig = `${from.id}|${to.id}|${quote.amount}|${quote.to_amount}`;
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { sig, key: randomUUID() };
    try {
      const done = await api<ConversionResult>('/conversions', {
        method: 'POST',
        headers: { 'Idempotency-Key': attempt.current.key },
        body: { from_account_id: from.id, to_account_id: to.id, amount: quote.amount, expected_to_amount: quote.to_amount, pin: pinValue, ...(otp ? { otp } : {}) },
      });
      setResult(done);
      setConfirmedPin(null);
      refresh();
    } catch (e) {
      onFailure(e);
    } finally {
      setBusy(false);
    }
  }

  function onFailure(e: unknown) {
    const message = describe(e);
    if (!(e instanceof ApiError)) return setError(message);
    switch (e.code) {
      case 'otp_required':
        setStep('code');
        setCode('');
        return setInfo(message);
      case 'rate_changed': // never convert at a number the user did not see: fetch the new one and ask again
        setTick((n) => n + 1);
        setStep('confirm');
        return setError(message);
      case 'pin_invalid':
        setPin('');
        setConfirmedPin(null);
        setStep('confirm');
        if (useFingerprint) {
          disableBioPay();
          setBioReady(false);
        }
        return setError(message);
      default:
        return setError(message);
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

  function again() {
    setResult(null);
    setAmountText('');
    setLoaded(null);
    setPin('');
    setCode('');
    setStep('confirm');
    attempt.current = null;
  }

  const label = (a: Account) => `${t(`accountTypes.${a.type}`)} · ${a.currency} · ${fmt.money(a.balance, a.currency)}`;

  if (result) {
    return (
      <FormScreen>
        <View style={{ alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.four }}>
          <Ionicons name="checkmark-circle" size={72} color={theme.success} />
          <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>{t('convert.doneTitle')}</Text>
          <Body muted>{t('convert.doneBody', { from: fmt.money(result.amount, result.from_currency), to: fmt.money(result.to_amount, result.to_currency) })}</Body>
        </View>
        <Card>
          <Caption>{t('convert.rate')}</Caption>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{fmt.num(t('rates.oneEquals', { from: result.from_currency, to: result.to_currency, value: formatNumber(result.rate) }))}</Text>
          <View style={{ height: Spacing.two }} />
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{fmt.money(result.from_balance, result.from_currency)}</Text>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{fmt.money(result.to_balance, result.to_currency)}</Text>
        </Card>
        <Button title={t('convert.another')} variant="secondary" onPress={again} />
        <Button title={t('convert.back')} onPress={() => router.navigate('/')} />
      </FormScreen>
    );
  }

  if (accounts !== null && (!from || targets.length === 0)) {
    return (
      <FormScreen>
        <Body muted>{t('convert.intro')}</Body>
        <Card>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{t('convert.needTwo')}</Text>
        </Card>
        <Button title={t('convert.openAccount')} icon="add-circle-outline" onPress={() => setOpening(true)} />
        <OpenAccountSheet visible={opening} onClose={() => setOpening(false)} onOpened={refresh} />
      </FormScreen>
    );
  }

  const receiveText = quote && to ? fmt.money(quote.to_amount, to.currency) : '—';
  const payText = from && amount !== null ? fmt.money(amount, from.currency) : '';

  return (
    <FormScreen>
      <Body muted>{t('convert.intro')}</Body>

      {from ? <Select label={t('convert.from')} icon="wallet-outline" value={from.id} options={active.map((a) => ({ value: a.id, label: label(a) }))} onChange={setFromId} /> : null}
      {to ? <Select label={t('convert.to')} icon="wallet-outline" value={to.id} options={targets.map((a) => ({ value: a.id, label: label(a) }))} onChange={setToId} /> : null}

      <TextField
        label={`${t('convert.amountLabel')} (${from?.currency ?? ''})`}
        value={amountText}
        onChangeText={(v) => setAmountText(sanitizeAmountInput(v, from?.currency))}
        grouped
        keyboardType="decimal-pad"
        placeholder={from?.currency === 'IRR' ? '0' : '0.00'}
        style={{ fontSize: 26, fontWeight: '800' }}
      />
      {tooMuch && from ? <ErrorText>{t('amount.notEnough', { balance: fmt.money(from.balance, from.currency) })}</ErrorText> : null}
      {amountText !== '' && amount === null ? <ErrorText>{t('amount.invalid')}</ErrorText> : null}

      <View style={{ backgroundColor: theme.hero, borderRadius: Radius.lg + 6, padding: Spacing.four, gap: Spacing.two }}>
        <Text style={{ color: theme.onHeroMuted, fontSize: 14, fontWeight: '600' }}>{t('convert.youGet')}</Text>
        <AmountText text={quoting ? t('convert.gettingRate') : receiveText} maxSize={34} minSize={16} color={theme.onHero} align="left" />
        {quote ? (
          <Text style={{ color: theme.onHeroMuted, fontSize: 14 }}>{fmt.num(t('rates.oneEquals', { from: quote.from_currency, to: quote.to_currency, value: formatNumber(quote.rate) }))}</Text>
        ) : null}
      </View>
      {quote?.stale ? <ErrorText>{t('rates.stale')}</ErrorText> : null}

      {quote && to ? (
        step === 'confirm' ? (
          user?.has_pin ? (
            <View style={{ gap: Spacing.three }}>
              {!useFingerprint ? (
                <TextField label={t('review.pin')} value={pin} onChangeText={(v) => setPin(sanitizePin(v))} secureTextEntry keyboardType="number-pad" maxLength={6} returnKeyType="go" onSubmitEditing={onConfirm} />
              ) : null}
              <ErrorText>{error}</ErrorText>
              <Button
                title={useFingerprint ? t('convert.withFingerprint', { amount: payText }) : t('convert.action', { amount: payText })}
                icon={useFingerprint ? 'finger-print' : 'swap-horizontal'}
                onPress={onConfirm}
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
            <TextField
              label={t('review.codeLabel')}
              value={code}
              onChangeText={(v) => setCode(sanitizePin(v))}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              autoFocus
              returnKeyType="go"
              onSubmitEditing={() => confirmedPin && isCompletePin(code) && submit(confirmedPin, code)}
            />
            <ErrorText>{error}</ErrorText>
            <Button title={t('convert.action', { amount: payText })} onPress={() => confirmedPin && submit(confirmedPin, code)} loading={busy} disabled={!isCompletePin(code) || !confirmedPin} />
            <Button title={t('review.newCode')} variant="secondary" onPress={() => confirmedPin && submit(confirmedPin)} />
            <Button title={t('review.openInbox')} variant="secondary" onPress={() => router.push('/security/messages')} />
          </View>
        )
      ) : (
        <ErrorText>{error}</ErrorText>
      )}
    </FormScreen>
  );
}

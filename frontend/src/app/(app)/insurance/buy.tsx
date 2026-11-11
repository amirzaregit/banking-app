import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OpenAccountSheet } from '@/accounts/open-account-sheet';
import { api, ApiError } from '@/api/client';
import { useSession } from '@/auth/session';
import type { Account, InsuranceDetails, InsurancePolicy, InsuranceProduct, InsuranceQuote } from '@/api/types';
import { AmountText } from '@/components/amount-text';
import { ConfirmPayment } from '@/components/confirm-payment';
import { CurrencyDot } from '@/components/currency-dot';
import { DateField } from '@/components/date-field';
import { Select } from '@/components/select';
import { Body, Button, Caption, Card, ErrorText, FieldLabel, FormScreen, Heading, Notice, OptionRow, ResultHeader, SectionTitle, Segmented, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { addDays, CAR_MONTHS, defaultForm, MAX_START_AHEAD_DAYS, MAX_TRAVELERS, MAX_TRIP_DAYS, MEDICAL_MONTHS, PRODUCTS, REGIONS, toDetails, type InsuranceForm } from '@/insurance/products';
import { formatDay, todayIso } from '@/lib/calendar';

const fetchAccounts = () => api<Account[]>('/accounts');

/** Choose a plan and its details, see the price in the currency of the account you pay from, and pay. */
export default function BuyInsurance() {
  const { product: raw } = useLocalSearchParams<{ product: string }>();
  const product = (PRODUCTS.some((p) => p.id === raw) ? raw : 'travel') as InsuranceProduct;
  const router = useRouter();
  const theme = useTheme();
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { user } = useSession();
  const { data: accounts, refresh } = useFocusData(fetchAccounts);

  const today = todayIso();
  const [form, setForm] = useState<InsuranceForm>(() => ({ ...defaultForm(product), start: todayIso() }));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [quote, setQuote] = useState<{ key: string; value: InsuranceQuote } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<InsurancePolicy | null>(null);
  const set = (patch: Partial<InsuranceForm>) => setForm((f) => ({ ...f, ...patch }));

  const eligible = (accounts ?? []).filter((a) => a.status === 'active');
  const account = eligible.find((a) => a.id === accountId) ?? eligible.find((a) => a.is_default) ?? eligible[0];
  const details: InsuranceDetails | null = toDetails(form);
  const key = details && account ? JSON.stringify([details, account.currency]) : null;
  const [attempt, setAttempt] = useState(0); // bumped to ask for the price again (it moved)

  // What the customer still has to fill in, first thing first. Shown as a message: a button that is not there explains nothing.
  const missing: string | null = !form.start
    ? 'start'
    : product === 'travel' && !form.end
      ? 'end'
      : product === 'car' && form.plate.replace(/[\s-]/g, '').length < 4
        ? 'plate'
        : product === 'home' && form.address.trim().length < 5
          ? 'address'
          : !account && accounts
            ? 'account'
            : null;

  // Ask the server for the price whenever the details or the paying currency change (after a short pause while typing).
  useEffect(() => {
    if (!details || !account) return;
    let active = true;
    const timer = setTimeout(() => {
      api<InsuranceQuote>('/insurance/quote', { method: 'POST', body: { ...details, currency: account.currency } })
        .then((value) => {
          if (!active) return;
          setQuote({ key: key!, value });
          setQuoteError(null);
        })
        .catch((e) => active && setQuoteError(describe(e)));
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // `details` and `account` are rebuilt every render; `key` already captures everything they contribute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, describe]);

  const current = quote && quote.key === key ? quote.value : null;
  const name = t(`insurance.products.${product}.name`);

  if (policy) {
    return (
      <FormScreen>
        <ResultHeader icon="shield-checkmark" title={t('insurance.doneTitle')} body={t('insurance.doneBody', { number: fmt.num(policy.policy_number), name: fmt.name(policy.holder_name) })} />
        <Button title={t('insurance.viewPolicy')} icon="document-text-outline" onPress={() => router.replace({ pathname: '/insurance/policy', params: { id: policy.id } })} />
        <Button title={t('insurance.back')} variant="secondary" onPress={() => router.replace('/insurance')} />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Card>
        <Heading>{name}</Heading>
        <Caption>{t(`insurance.products.${product}.desc`)}</Caption>
      </Card>

      <SectionTitle>{t('insurance.steps.plan')}</SectionTitle>
      <View style={{ gap: Spacing.two }}>
        {PRODUCTS.find((p) => p.id === product)!.plans.map((plan) => (
          <OptionRow key={plan} title={t(`insurance.plans.${plan}`)} sub={t(`insurance.planHint.${plan}`)} selected={plan === form.plan} onPress={() => set({ plan })} />
        ))}
      </View>

      <SectionTitle>{t(product === 'travel' ? 'insurance.steps.whenTrip' : 'insurance.steps.whenStart')}</SectionTitle>
      <View style={styles.dates}>
        <DateField label={t('insurance.fields.start')} invalid={missing === 'start'} value={form.start} min={today} max={addDays(today, MAX_START_AHEAD_DAYS)} onChange={(iso) => set({ start: iso, end: product === 'travel' && iso && form.end && form.end < iso ? undefined : form.end })} />
        {product === 'travel' ? <DateField label={t('insurance.fields.end')} invalid={missing === 'end'} value={form.end} min={form.start ?? today} max={form.start ? addDays(form.start, MAX_TRIP_DAYS - 1) : undefined} onChange={(iso) => set({ end: iso })} /> : null}
      </View>

      <SectionTitle>{t('insurance.steps.details')}</SectionTitle>

      {product === 'travel' ? (
        <>
          <Select label={t('insurance.fields.region')} icon="earth-outline" value={form.region} options={REGIONS.map((r) => ({ value: r, label: t(`insurance.regions.${r}`) }))} onChange={(region) => set({ region })} />
          <View style={{ gap: 6 }}>
            <FieldLabel>{t('insurance.fields.travelers')}</FieldLabel>
            <Segmented<string> value={String(form.travelers)} onChange={(v) => set({ travelers: Number(v) })} options={Array.from({ length: MAX_TRAVELERS }, (_, i) => ({ value: String(i + 1), label: fmt.num(String(i + 1)) }))} />
          </View>
        </>
      ) : null}

      {product === 'medical' || product === 'car' ? (
        <View style={{ gap: 6 }}>
          <FieldLabel>{t('insurance.fields.term')}</FieldLabel>
          <Segmented<string> value={String(form.months)} onChange={(v) => set({ months: Number(v) })} options={(product === 'car' ? CAR_MONTHS : MEDICAL_MONTHS).map((m) => ({ value: String(m), label: t(`insurance.terms.m${m}`) }))} />
        </View>
      ) : null}

      {product === 'car' ? <TextField label={t('insurance.fields.plate')} style={missing === 'plate' ? { borderColor: theme.danger, borderWidth: 2 } : undefined} value={form.plate} onChangeText={(plate) => set({ plate })} autoCapitalize="characters" autoCorrect={false} placeholder="A 123 BC 77" /> : null}
      {product === 'home' ? <TextField label={t('insurance.fields.address')} value={form.address} onChangeText={(address) => set({ address })} multiline maxLength={120} style={[{ minHeight: 80, textAlignVertical: 'top' }, missing === 'address' ? { borderColor: theme.danger, borderWidth: 2 } : null]} /> : null}
      {product === 'home' ? <Caption>{t('insurance.homeTerm')}</Caption> : null}

      <SectionTitle>{t('insurance.steps.pay')}</SectionTitle>
      {account ? (
        <Select
          label={t('insurance.fields.payFrom')}
          icon="wallet-outline"
          value={account.id}
          options={eligible.map((a) => ({ value: a.id, label: `${a.currency} · ${t(`accountTypes.${a.type}`)} · ${fmt.money(a.balance, a.currency)}`, leading: <CurrencyDot code={a.currency} size={26} /> }))}
          onChange={setAccountId}
        />
      ) : accounts ? (
        <View style={{ gap: Spacing.three }}>
          <ErrorText>{t('insurance.noAccount')}</ErrorText>
          <Button title={t('bills.openAccount')} icon="add-circle-outline" variant="secondary" onPress={() => setOpening(true)} />
        </View>
      ) : null}

      <ErrorText>{quoteError}</ErrorText>
      {missing ? <Notice tone="warning" icon="alert-circle">{t(`insurance.missing.${missing}`)}</Notice> : null}
      {current ? (
        <Card>
          <View style={{ gap: Spacing.two }}>
            <Caption>{t('insurance.summary.premium')}</Caption>
            <AmountText text={fmt.money(current.premium, current.currency)} maxSize={34} minSize={16} color={theme.text} />
            <Body>{t('insurance.summary.coverage', { amount: fmt.money(current.coverage, current.currency) })}</Body>
            <Body>{t('insurance.summary.period', { from: formatDay(current.start_date, lang), to: formatDay(current.end_date, lang) })}</Body>
            <Body>{t('insurance.summary.holder', { name: fmt.name(user?.full_name ?? '') })}</Body>
            {current.currency !== 'USD' ? <Caption>{t('insurance.rateNote')}</Caption> : null}
          </View>
        </Card>
      ) : null}

      {account && details && current ? (
        <ConfirmPayment
          sig={`${key}|${current.premium}`}
          title={t('insurance.pay', { amount: fmt.money(current.premium, current.currency) })}
          fingerprintTitle={t('insurance.pay', { amount: fmt.money(current.premium, current.currency) })}
          send={async (pin, otp, idempotencyKey) => {
            try {
              const done = await api<InsurancePolicy>('/insurance/policies', {
                method: 'POST',
                headers: { 'Idempotency-Key': idempotencyKey },
                body: { ...details, account_id: account.id, pin, expected_premium: current.premium, ...(otp ? { otp } : {}) },
              });
              setPolicy(done);
              refresh();
            } catch (e) {
              if (e instanceof ApiError && e.code === 'price_changed') setAttempt((n) => n + 1); // the exchange rate moved: fetch the new price
              throw e;
            }
          }}
          onDone={() => {}}
        />
      ) : (
        // Always show the button, so it is clear that paying exists and what is missing.
        <Button title={t('insurance.completeToPay')} icon="lock-closed-outline" disabled onPress={() => {}} />
      )}
      <OpenAccountSheet visible={opening} onClose={() => setOpening(false)} onOpened={refresh} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  dates: { flexDirection: 'row', gap: Spacing.two },
});

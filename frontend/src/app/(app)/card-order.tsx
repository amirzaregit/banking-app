import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Account, CardOrder } from '@/api/types';
import { BRANCHES, type BranchId } from '@/branches/data';
import { PlasticCard, type PlasticTheme } from '@/cards/plastic-card';
import { CurrencyDot } from '@/components/currency-dot';
import { Body, Button, Caption, Card, Detail, ErrorText, Loading, OptionRow, ResultHeader, Segmented, SectionTitle } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/auth/session';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

type Step = 'review' | 'design' | 'branch' | 'done';
const STEPS: Step[] = ['review', 'design', 'branch'];

/**
 * Order a plastic card for one account: check your details, pick a light or dark design, pick a branch and how to be told.
 * If a card for this account is already being made, this screen shows that order instead, so ordering twice is impossible.
 */
export default function CardOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { user } = useSession();

  const [account, setAccount] = useState<Account | null>(null);
  const [existing, setExisting] = useState<CardOrder | null | undefined>(undefined); // undefined = still loading
  const [step, setStep] = useState<Step>('review');
  const [design, setDesign] = useState<PlasticTheme>('dark');
  const [branch, setBranch] = useState<BranchId>(BRANCHES[0].id);
  const [notifyBy, setNotifyBy] = useState<'app' | 'phone'>('app');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api<Account>(`/accounts/${id}`), api<CardOrder[]>(`/accounts/${id}/card-orders`)])
      .then(([acc, orders]) => {
        if (!active) return;
        setAccount(acc);
        setExisting(orders.find((o) => o.status === 'pending') ?? orders[0] ?? null);
      })
      .catch((e) => active && (setError(describe(e, 'errors.loadData')), setExisting(null)));
    return () => {
      active = false;
    };
  }, [id, describe]);

  const branchName = (b: string) => t(`branches.items.${b}.name`);
  const last4 = account ? fmt.num(account.account_number.slice(-4)) : '';

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const order = await api<CardOrder>(`/accounts/${id}/card-orders`, { method: 'POST', body: { theme: design, branch_id: branch, notify_by: notifyBy } });
      setExisting(order);
      setStep('done');
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  if (!account || existing === undefined) {
    return <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}><Loading error={error} /></SafeAreaView>;
  }

  const holder = user?.full_name ?? '';
  const isStatus = existing !== null && (existing.status === 'pending' || step === 'done');

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {isStatus && existing ? (
          // ---- a card is already in production (or was just ordered): show where it stands
          <>
            <ResultHeader icon={step === 'done' ? 'checkmark-circle' : 'time-outline'} tone={step === 'done' ? 'success' : 'neutral'} title={step === 'done' ? t('cardServices.doneTitle') : t('cardServices.pendingTitle')} />
            <PlasticCard variant={existing.theme} currency={account.currency} holder={holder} brand={t('common.appName')} />
            <Card>
              <Body>
                {step === 'done'
                  ? t(existing.notify_by === 'phone' ? 'cardServices.donePhone' : 'cardServices.doneApp', { branch: branchName(existing.branch_id), phone: fmt.num(user?.phone ?? '') })
                  : t('cardServices.pendingBody', { date: fmt.date(existing.created_at), theme: t(existing.theme === 'light' ? 'cardServices.themeLight' : 'cardServices.themeDark'), branch: branchName(existing.branch_id) })}
              </Body>
              <View style={{ marginTop: Spacing.two }}>
                <Caption>{t('cardServices.pendingNote')}</Caption>
              </View>
            </Card>
            <ErrorText>{error}</ErrorText>
            <Button title={t('cardServices.toAccount')} onPress={() => router.back()} />
          </>
        ) : existing?.status === 'ready' && step === 'review' && existing ? (
          // ---- the last card is finished: say so once, then allow a new order
          <>
            <ResultHeader icon="gift-outline" tone="neutral" title={t('cardServices.readyTitle')} body={t('cardServices.readyBody', { branch: branchName(existing.branch_id) })} />
            <Button title={t('cardServices.orderCard')} icon="card-outline" onPress={() => setExisting(null)} />
          </>
        ) : (
          // ---- the three steps
          <>
            <Caption>{t('cardServices.step', { n: STEPS.indexOf(step) + 1, total: STEPS.length })}</Caption>

            {step === 'review' ? (
              <>
                <SectionTitle>{t('cardServices.reviewTitle')}</SectionTitle>
                <Body muted>{t('cardServices.reviewIntro')}</Body>
                <Card>
                  <View style={{ gap: Spacing.three }}>
                    <Detail label={t('cardServices.fName')} value={fmt.name(holder)} />
                    <Detail label={t('cardServices.fPhone')} value={fmt.num(user?.phone ?? '—')} />
                    <Detail label={t('cardServices.fEmail')} value={user?.email ?? '—'} />
                    <Detail label={t('cardServices.fAccount')} value={`${account.currency} · ${t(`accountTypes.${account.type}`)} ••${last4}`} leading={<CurrencyDot code={account.currency} size={26} />} />
                  </View>
                </Card>
                <Button title={t('cardServices.confirmDetails')} icon="checkmark" onPress={() => setStep('design')} />
              </>
            ) : null}

            {step === 'design' ? (
              <>
                <SectionTitle>{t('cardServices.designTitle')}</SectionTitle>
                <PlasticCard variant={design} currency={account.currency} holder={holder} brand={t('common.appName')} />
                <Segmented<PlasticTheme>
                  value={design}
                  onChange={setDesign}
                  options={[
                    { value: 'light', label: t('cardServices.themeLight') },
                    { value: 'dark', label: t('cardServices.themeDark') },
                  ]}
                />
                <Button title={t('cardServices.next')} onPress={() => setStep('branch')} />
                <Button title={t('cardServices.back')} variant="secondary" onPress={() => setStep('review')} />
              </>
            ) : null}

            {step === 'branch' ? (
              <>
                <SectionTitle>{t('cardServices.branchTitle')}</SectionTitle>
                <View style={{ gap: Spacing.two }}>
                  {BRANCHES.map((b) => (
                    <OptionRow key={b.id} title={branchName(b.id)} sub={t(`branches.items.${b.id}.address`)} selected={b.id === branch} onPress={() => setBranch(b.id)} />
                  ))}
                </View>
                <SectionTitle>{t('cardServices.notifyTitle')}</SectionTitle>
                <Segmented<'app' | 'phone'>
                  value={notifyBy}
                  onChange={setNotifyBy}
                  options={[
                    { value: 'app', label: t('cardServices.notifyApp') },
                    { value: 'phone', label: t('cardServices.notifyPhone') },
                  ]}
                />
                <ErrorText>{error}</ErrorText>
                <Button title={t('cardServices.submitOrder')} icon="card-outline" onPress={submit} loading={busy} />
                <Button title={t('cardServices.back')} variant="secondary" onPress={() => setStep('design')} />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
});

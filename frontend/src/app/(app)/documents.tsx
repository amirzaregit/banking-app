import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import type { Account } from '@/api/types';
import { ActionRow, Body, Button, Caption, Card, ErrorText, FormScreen, SectionTitle } from '@/components/ui';
import { Select } from '@/components/select';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { buildCertificateHtml, certificateFileName } from '@/certificates/document';
import { PdfCard } from '@/components/pdf-card';
import { usePdfDocument } from '@/hooks/use-pdf-document';
import { CERTIFICATE_TYPES, NEEDS, type Certificate, type CertificateLang, type CertificateSummary, type CertificateType } from '@/certificates/types';
import { useCountdown } from '@/hooks/use-countdown';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { LANG_CODES, type Lang } from '@/i18n';
import { presetRange } from '@/history/period';

const fetchAccounts = () => api<Account[]>('/accounts');
const fetchMine = () => api<CertificateSummary[]>('/certificates');

type PeriodChoice = 'days30' | 'days90' | 'thisYear' | 'all';
const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', ru: 'Русский', fa: 'فارسی' };

/** Official letters from the bank: made on the spot as a PDF, or asked for on paper at a branch. */
export default function Documents() {
  const router = useRouter();
  const theme = useTheme();
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { data: accounts } = useFocusData(fetchAccounts);
  const { data: mine, refresh } = useFocusData(fetchMine);

  const [type, setType] = useState<CertificateType>('account_confirmation');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodChoice>('days90');
  const [docLang, setDocLang] = useState<CertificateLang>(lang);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The certificate just created or reopened. Its PDF is handled by the shared file code (view, save, share, print).
  const [ready, setReady] = useState<Certificate | null>(null);
  const pdf = usePdfDocument(ready ? { html: buildCertificateHtml(ready), fileName: certificateFileName(ready), title: ready.ref_number } : null);
  // A new certificate can only be made every few seconds: the button counts down.
  const { remaining, start: startCooldown } = useCountdown();

  const active = (accounts ?? []).filter((a) => a.status === 'active');
  const account = active.find((a) => a.id === accountId) ?? active[0];
  const needs = NEEDS[type];

  async function create() {
    setBusy('create');
    setError(null);
    setReady(null);
    let cert: Certificate;
    try {
      const range = needs.period ? presetRange(period === 'all' ? 'all' : period) : {};
      cert = await api<Certificate>('/certificates', {
        method: 'POST',
        body: { type, language: docLang, keep, account_id: needs.account ? account?.id : undefined, date_from: range.from, date_to: range.to },
      });
    } catch (e) {
      setError(describe(e));
      if (e instanceof ApiError && e.code === 'rate_limited') startCooldown(Number(e.params?.seconds ?? 5));
      setBusy(null);
      return;
    }
    startCooldown(5);
    if (cert.kept) refresh();
    setReady(cert);
    setBusy(null);
  }

  async function reopen(id: string) {
    setBusy(id);
    setError(null);
    try {
      setReady(await api<Certificate>(`/certificates/${id}`));
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <FormScreen>
      <Body muted>{t('documents.intro')}</Body>

      <SectionTitle>{t('documents.digital')}</SectionTitle>
      <Card>
        <View style={{ gap: Spacing.three }}>
          <Select label={t('documents.type')} icon="document-text-outline" value={type} options={CERTIFICATE_TYPES.map((c) => ({ value: c, label: t(`documents.types.${c}`) }))} onChange={(v) => setType(v as CertificateType)} />
          <Caption>{t(`documents.hints.${type}`)}</Caption>

          {needs.account && account ? (
            <Select
              label={t('documents.account')}
              icon="wallet-outline"
              value={account.id}
              options={active.map((a) => ({ value: a.id, label: `${t(`accountTypes.${a.type}`)} · ${a.currency} · ${fmt.num(`•••• ${a.account_number.slice(-4)}`)}` }))}
              onChange={setAccountId}
            />
          ) : null}

          {needs.period ? (
            <Select
              label={t('documents.period')}
              icon="calendar-outline"
              value={period}
              options={(['days30', 'days90', 'thisYear', 'all'] as const).map((p) => ({ value: p, label: t(`documents.periods.${p}`) }))}
              onChange={(v) => setPeriod(v as PeriodChoice)}
            />
          ) : null}

          <Select label={t('documents.language')} icon="language-outline" value={docLang} options={LANG_CODES.map((c) => ({ value: c, label: LANGUAGE_NAMES[c] }))} onChange={(v) => setDocLang(v as CertificateLang)} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{t('documents.keep')}</Text>
              <Caption>{t('documents.keepSub')}</Caption>
            </View>
            <Switch value={keep} onValueChange={setKeep} accessibilityLabel={t('documents.keep')} trackColor={{ true: theme.primary, false: theme.border }} />
          </View>

          <ErrorText>{error}</ErrorText>
          <Button
            title={remaining > 0 ? t('documents.wait', { n: remaining }) : t('documents.create')}
            icon="document-text-outline"
            onPress={create}
            loading={busy === 'create'}
            disabled={(needs.account && !account) || remaining > 0}
          />
        </View>
      </Card>

      {ready ? <PdfCard pdf={pdf} title={t('documents.readyTitle')} subtitle={`${t(`documents.types.${ready.type}`)} · ${fmt.num(ready.ref_number)}`} /> : null}

      <SectionTitle>{t('documents.paper')}</SectionTitle>
      <Card>
        <View style={{ gap: Spacing.three }}>
          <Body>{t('documents.paperBody')}</Body>
          <Button title={t('documents.findBranch')} icon="location-outline" variant="secondary" onPress={() => router.push('/branches')} />
        </View>
      </Card>

      <SectionTitle>{t('documents.mine')}</SectionTitle>
      {mine && mine.length === 0 ? <Body muted>{t('documents.none')}</Body> : null}
      {(mine ?? []).map((c) => (
        <ActionRow key={c.id} title={`${t(`documents.types.${c.type}`)} · ${fmt.num(c.ref_number)}`} icon="document-outline" onPress={() => reopen(c.id)} loading={busy === c.id} />
      ))}
    </FormScreen>
  );
}

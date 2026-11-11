import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { api } from '@/api/client';
import type { InsurancePolicy } from '@/api/types';
import { PdfCard } from '@/components/pdf-card';
import { Card, Chip, Detail, FormScreen, Heading, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { usePdfDocument } from '@/hooks/use-pdf-document';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { buildPolicyHtml, policyFileName } from '@/insurance/policy-document';
import { useI18n } from '@/i18n/provider';
import type { Lang } from '@/i18n';
import { formatDay } from '@/lib/calendar';

/** One policy: its details, and the certificate as a PDF in the language you pick. */
export default function PolicyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const fetchPolicy = useCallback(() => api<InsurancePolicy>(`/insurance/policies/${id}`), [id]);
  const { data: policy, error: loadError } = useFocusData(fetchPolicy);
  const [docLang, setDocLang] = useState<Lang>(lang);
  const pdf = usePdfDocument(policy ? { html: buildPolicyHtml(policy, docLang), fileName: policyFileName(policy), title: policy.policy_number } : null);

  if (!policy) return <FormScreen><Loading error={loadError} /></FormScreen>;

  const d = policy.details;
  const rows: [string, string][] = [
    [t('insurance.policy.holder'), fmt.name(policy.holder_name)],
    [t('insurance.policy.number'), fmt.num(policy.policy_number)],
    [t('insurance.policy.plan'), t(`insurance.plans.${policy.plan}`)],
    [t('insurance.policy.period'), `${formatDay(policy.start_date, lang)} – ${formatDay(policy.end_date, lang)}`],
    [t('insurance.policy.coverage'), fmt.money(policy.coverage, policy.currency)],
    [t('insurance.policy.premium'), fmt.money(policy.premium, policy.currency)],
    ...(d.region ? ([[t('insurance.policy.region'), t(`insurance.regions.${d.region}`)]] as [string, string][]) : []),
    ...(d.travelers ? ([[t('insurance.policy.travelers'), fmt.num(String(d.travelers))]] as [string, string][]) : []),
    ...(d.plate ? ([[t('insurance.policy.plate'), fmt.num(d.plate)]] as [string, string][]) : []),
    ...(d.address ? ([[t('insurance.policy.address'), d.address]] as [string, string][]) : []),
  ];

  return (
    <FormScreen>
      <Card>
        <View style={{ gap: Spacing.three }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <Ionicons name="shield-checkmark" size={28} color={theme.primaryText} />
            <View style={{ flex: 1 }}>
              <Heading>{t(`insurance.products.${policy.product}.name`)}</Heading>
            </View>
            <Chip tone={policy.status === 'active' ? 'success' : policy.status === 'expired' ? 'danger' : 'gold'}>{t(`insurance.statusShort.${policy.status}`)}</Chip>
          </View>
          {rows.map(([label, value]) => (
            <Detail key={label} label={label} value={value} />
          ))}
        </View>
      </Card>

      <PdfCard pdf={pdf} title={t('insurance.certificate')} language={{ value: docLang, onChange: setDocLang }} />
    </FormScreen>
  );
}

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { api } from '@/api/client';
import type { InsurancePolicy } from '@/api/types';
import { ActionRow, Body, FormScreen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { PRODUCTS } from '@/insurance/products';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { formatDay } from '@/lib/calendar';

const fetchPolicies = () => api<InsurancePolicy[]>('/insurance/policies');

/** What the bank insures: four large cards. Your policies appear underneath, only once you have some. */
export default function Insurance() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const fmt = useFormat();
  const { data: policies } = useFocusData(fetchPolicies);

  const statusText = (p: InsurancePolicy) => t(`insurance.status.${p.status}`, { date: formatDay(p.status === 'upcoming' ? p.start_date : p.end_date, lang) });

  return (
    <FormScreen>
      <Body muted>{t('insurance.intro')}</Body>

      <View style={{ gap: Spacing.two }}>
        {PRODUCTS.map((p) => (
          <ActionRow key={p.id} title={t(`insurance.products.${p.id}.name`)} sub={t(`insurance.products.${p.id}.desc`)} icon={p.icon} onPress={() => router.push({ pathname: '/insurance/buy', params: { product: p.id } })} />
        ))}
      </View>

      {policies && policies.length > 0 ? (
        <View style={{ gap: Spacing.two }}>
          <SectionTitle>{t('insurance.myPolicies')}</SectionTitle>
          {policies.map((p) => (
            <ActionRow
              key={p.id}
              title={`${t(`insurance.products.${p.product}.name`)} · ${fmt.num(p.policy_number)}`}
              sub={statusText(p)}
              icon={PRODUCTS.find((x) => x.id === p.product)?.icon ?? 'shield-checkmark-outline'}
              onPress={() => router.push({ pathname: '/insurance/policy', params: { id: p.id } })}
            />
          ))}
        </View>
      ) : null}
    </FormScreen>
  );
}

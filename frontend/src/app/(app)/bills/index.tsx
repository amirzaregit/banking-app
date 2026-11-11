import { useRouter } from 'expo-router';
import { Fragment, useState } from 'react';

import { api } from '@/api/client';
import type { BillProvider } from '@/api/types';
import { FilterChips } from '@/components/filter-chips';
import { ActionRow, Body, ErrorText, FormScreen, SectionTitle } from '@/components/ui';
import { useFocusData } from '@/hooks/use-focus-data';
import { useI18n } from '@/i18n/provider';

const fetchProviders = () => api<BillProvider[]>('/bills/providers');
const CATEGORIES = ['mobile', 'internet', 'utilities', 'government', 'charity'] as const;
const CATEGORY_ICON = { mobile: 'phone-portrait-outline', internet: 'wifi-outline', utilities: 'flash-outline', government: 'business-outline', charity: 'heart-outline' } as const;

/** Pick what to pay: a category, then a provider (mobile operators, utilities, taxes, charities...). */
export default function Bills() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { data: providers, error } = useFocusData(fetchProviders);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('mobile');

  const shown = (providers ?? []).filter((p) => p.category === category);
  const countries = (['RUB', 'IRR'] as const).filter((c) => shown.some((p) => p.currency === c));

  return (
    <FormScreen>
      <Body muted>{t('bills.intro')}</Body>
      <FilterChips options={CATEGORIES.map((c) => ({ value: c, label: t(`bills.categories.${c}`) }))} value={category} onChange={setCategory} />
      <ErrorText>{error}</ErrorText>
      <SectionTitle>{t('bills.choose')}</SectionTitle>
      {countries.map((currency) => (
        <Fragment key={currency}>
          <SectionTitle>{t(`bills.country.${currency}`)}</SectionTitle>
          {shown
            .filter((p) => p.currency === currency)
            .map((p) => (
              <ActionRow key={p.id} title={p.names[lang]} sub={t('bills.paidIn', { currency: p.currency })} icon={CATEGORY_ICON[p.category]} onPress={() => router.push({ pathname: '/bills/pay', params: { provider: p.id } })} />
            ))}
        </Fragment>
      ))}
    </FormScreen>
  );
}

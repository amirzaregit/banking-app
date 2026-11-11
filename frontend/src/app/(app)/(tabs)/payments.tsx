import { useRouter, type Href } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionRow, SectionTitle, Title } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n/provider';

type Item = { key: 'transfer' | 'request' | 'payLink' | 'gift' | 'bills' | 'insurance' | 'topup' | 'convert'; icon: React.ComponentProps<typeof import('@expo/vector-icons').Ionicons>['name']; href: Href };

const SECTIONS: { title: 'sendReceive' | 'payFor' | 'myAccounts'; items: Item[] }[] = [
  {
    title: 'sendReceive',
    items: [
      { key: 'transfer', icon: 'paper-plane-outline', href: '/transfer' },
      { key: 'request', icon: 'qr-code-outline', href: '/request' },
      { key: 'payLink', icon: 'scan-outline', href: '/pay-link' },
      { key: 'gift', icon: 'gift-outline', href: '/gift' },
    ],
  },
  {
    title: 'payFor',
    items: [
      { key: 'bills', icon: 'receipt-outline', href: '/bills' },
      { key: 'insurance', icon: 'shield-checkmark-outline', href: '/insurance' },
    ],
  },
  {
    title: 'myAccounts',
    items: [
      { key: 'topup', icon: 'add-circle-outline', href: '/topup' },
      { key: 'convert', icon: 'swap-horizontal-outline', href: '/convert' },
    ],
  },
];

/** Everything you can DO with money, in one place: send, request, pay, gift, top up, exchange. */
export default function Payments() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t('tabs.payments')}</Title>
        {SECTIONS.map((section) => (
          <View key={section.title} style={{ gap: Spacing.two }}>
            <SectionTitle>{t(`payments.${section.title}`)}</SectionTitle>
            {section.items.map((item) => (
              <ActionRow key={item.key} title={t(`payments.${item.key}.title`)} sub={t(`payments.${item.key}.sub`)} icon={item.icon} onPress={() => router.push(item.href)} />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
});

import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountsCarousel } from '@/accounts/accounts-carousel';
import { OpenAccountSheet } from '@/accounts/open-account-sheet';
import { api } from '@/api/client';
import type { Account, NotificationList } from '@/api/types';
import { useSession } from '@/auth/session';
import { Glass } from '@/components/glass';
import { Text } from '@/components/text';
import { Button, Caption, ErrorText, IconBadge, SectionTitle } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { ACCOUNT_CURRENCIES } from '@/lib/money';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const SERVICES: { key: 'convert' | 'insurance' | 'documents' | 'rates' | 'branches' | 'support'; icon: IconName; href: Href }[] = [
  { key: 'convert', icon: 'swap-horizontal-outline', href: '/convert' },
  { key: 'insurance', icon: 'shield-checkmark-outline', href: '/insurance' },
  { key: 'documents', icon: 'document-text-outline', href: '/documents' },
  { key: 'rates', icon: 'cash-outline', href: '/rates' },
  { key: 'branches', icon: 'location-outline', href: '/branches' },
  { key: 'support', icon: 'chatbubbles-outline', href: '/support' },
];

function ServiceTile({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Glass style={styles.tile}>
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.tileInner, { opacity: pressed ? 0.8 : 1 }]}>
        <IconBadge name={icon} size={44} />
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
        <Caption>{sub}</Caption>
      </Pressable>
    </Glass>
  );
}

const fetchAccounts = () => api<Account[]>('/accounts');
const fetchBadge = () => api<NotificationList>('/notifications?limit=1'); // we only need the unread count

export default function Home() {
  const { user } = useSession();
  const theme = useTheme();
  const router = useRouter();
  const { t } = useI18n();
  const fmt = useFormat();
  const { data: accounts, error, refreshing, refresh } = useFocusData(fetchAccounts);
  const { data: badge } = useFocusData(fetchBadge);
  const unread = badge?.unread_count ?? 0;
  const [opening, setOpening] = useState(false);

  // Balances of different currencies are never added together: one total per currency.
  const totals = ACCOUNT_CURRENCIES.map((c) => ({ currency: c, total: (accounts ?? []).filter((a) => a.currency === c).reduce((sum, a) => sum + a.balance, 0), has: (accounts ?? []).some((a) => a.currency === c) })).filter((x) => x.has);

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Caption>{t('home.hello', { name: user?.full_name ?? '' })}</Caption>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? t('home.notificationsUnread', { count: unread }) : t('home.notifications')}
            onPress={() => router.push('/notifications')}
            hitSlop={10}
            style={[styles.bell, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="notifications-outline" size={22} color={theme.text} />
            {unread > 0 ? (
              <View style={[styles.badge, { backgroundColor: theme.gold, borderColor: theme.background }]}>
                <Text style={{ color: theme.onGold, fontSize: 11, fontWeight: '800' }}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <ErrorText>{error}</ErrorText>

        <SectionTitle>{t('home.accounts')}</SectionTitle>
        {accounts ? <AccountsCarousel accounts={accounts} onAdd={() => setOpening(true)} /> : <View style={{ height: 170 }} />}

        {totals.length > 0 ? (
          <Glass>
            <View style={[styles.totals, { padding: Spacing.three }]}>
              <Caption>{t('home.totalBalance')}</Caption>
              <View style={styles.totalsRow}>
                {totals.map((x) => (
                  <Text key={x.currency} style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
                    {fmt.money(x.total, x.currency)}
                  </Text>
                ))}
              </View>
            </View>
          </Glass>
        ) : null}

        <Button title={t('home.sendMoney')} icon="paper-plane" onPress={() => router.push('/transfer')} />

        <SectionTitle>{t('services.title')}</SectionTitle>
        <View style={styles.grid}>
          {SERVICES.map((s) => (
            <ServiceTile key={s.key} icon={s.icon} title={t(`services.${s.key}.title`)} sub={t(`services.${s.key}.sub`)} onPress={() => router.push(s.href)} />
          ))}
        </View>
      </ScrollView>
      <OpenAccountSheet visible={opening} onClose={() => setOpening(false)} onOpened={refresh} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  badge: { position: 'absolute', top: -4, end: -4, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2 },
  totals: { gap: 2 },
  totalsRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  tile: { width: '47.5%', flexGrow: 1 },
  tileInner: { padding: Spacing.three, gap: Spacing.two },
});

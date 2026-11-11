import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { AppNotification, NotificationList } from '@/api/types';
import { Text } from '@/components/text';
import { Body, Caption, ErrorText } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { renderNotification } from '@/notifications/render';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Security events get a shield, money gets cash, cards get a card. */
function iconFor(kind: string): { name: IconName; alert: boolean } {
  if (kind === 'payment_received') return { name: 'cash-outline', alert: false };
  if (kind === 'insurance_bought') return { name: 'shield-checkmark-outline', alert: false };
  if (kind.startsWith('card_')) return { name: 'card-outline', alert: kind === 'card_frozen' || kind === 'card_blocked' };
  return { name: 'shield-checkmark-outline', alert: kind === 'new_sign_in' || kind === 'pin_locked' };
}

const fetchList = () => api<NotificationList>('/notifications?limit=50');

export default function Notifications() {
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const list = await fetchList();
    setItems(list.items); // what was unread when you opened the screen stays highlighted...
    if (list.unread_count > 0) {
      api('/notifications/read-all', { method: 'POST' }).catch(() => {}); // ...while the badge clears
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().then(
        () => active && setError(null),
        (e) => active && setError(describe(e, 'errors.loadData')),
      );
      return () => {
        active = false;
      };
    }, [load, describe]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
      setError(null);
    } catch (e) {
      setError(describe(e, 'errors.loadData'));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<ErrorText>{error}</ErrorText>}
        ListEmptyComponent={items ? <Body muted>{t('notifications.empty')}</Body> : undefined}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        renderItem={({ item }) => {
          const icon = iconFor(item.kind);
          const unread = item.read_at === null;
          const text = renderNotification(item, t, fmt.money);
          return (
            <View
              accessible
              accessibilityLabel={`${unread ? t('notifications.newLabel') + ' ' : ''}${text.title}. ${text.body}`}
              style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: unread ? theme.primary : theme.border }]}>
              <View style={[styles.iconWrap, { backgroundColor: icon.alert ? theme.goldSoft : theme.backgroundSelected }]}>
                <Ionicons name={icon.name} size={22} color={icon.alert ? theme.onGoldSoft : theme.primaryText} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.text, fontWeight: unread ? '800' : '700', fontSize: 16 }}>{text.title}</Text>
                <Text style={{ color: theme.text, fontSize: 14 }}>{text.body}</Text>
                <Caption>{fmt.date(item.created_at)}</Caption>
              </View>
              {unread ? <View style={[styles.dot, { backgroundColor: theme.gold }]} /> : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.md, borderWidth: 1.5, alignItems: 'flex-start' },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});

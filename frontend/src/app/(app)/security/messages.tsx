import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { SmsMessage } from '@/api/types';
import { Body, Caption, Card, ErrorText } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

const fetchInbox = () => api<SmsMessage[]>('/sms/inbox');

export default function Messages() {
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const { data, error, refreshing, refresh } = useFocusData(fetchInbox);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={data ?? []}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Caption>{t('messages.demoNote')}</Caption>
            <ErrorText>{error}</ErrorText>
          </>
        }
        renderItem={({ item }) => (
          <Card>
            {/* The SMS text is written by the server in the language this app sent (Accept-Language). */}
            <Body>{item.body}</Body>
            <Caption>{fmt.date(item.created_at)}</Caption>
          </Card>
        )}
        ItemSeparatorComponent={() => <>{null}</>}
        ListEmptyComponent={data ? <Body muted>{t('messages.empty')}</Body> : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
});

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { DeviceSession } from '@/api/types';
import { useSession } from '@/auth/session';
import { Text } from '@/components/text';
import { Button, Caption, Card, ErrorText, IconBadge, LanguageSwitcher, SectionTitle, Title } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFocusData } from '@/hooks/use-focus-data';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { EditProfileDialog } from '@/profile/edit-dialog';
import { SecuritySection } from '@/security/security-section';

const fetchSessions = () => api<DeviceSession[]>('/auth/sessions');

export default function Settings() {
  const { user, signOut } = useSession();
  const theme = useTheme();
  const { t } = useI18n();
  const fmt = useFormat();
  const describe = useErrors();
  const { data: sessions, error, refresh } = useFocusData(fetchSessions);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function revoke(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      await api(`/auth/sessions/${id}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      setActionError(describe(e));
    } finally {
      setBusy(null);
    }
  }

  async function signOutEverywhere() {
    setBusy('all');
    setActionError(null);
    try {
      await api('/auth/logout-all', { method: 'POST' });
      await signOut(); // clears this device too
    } catch (e) {
      setActionError(describe(e));
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t('tabs.settings')}</Title>

        <SectionTitle>{t('settings.profile')}</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <IconBadge name="person" size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{user ? fmt.name(user.full_name) : ''}</Text>
              <Caption>{user?.email}</Caption>
              <Caption>{user?.phone ? fmt.num(user.phone) : t('settings.noPhone')}</Caption>
            </View>
          </View>
          <View style={{ marginTop: Spacing.three }}>
            <Button title={t('profile.edit')} icon="create-outline" variant="secondary" onPress={() => setEditing(true)} />
          </View>
        </Card>
        <EditProfileDialog visible={editing} onClose={() => setEditing(false)} />

        <SectionTitle>{t('settings.language')}</SectionTitle>
        <LanguageSwitcher />

        <SecuritySection />

        <SectionTitle>{t('settings.devices')}</SectionTitle>
        <ErrorText>{error ?? actionError}</ErrorText>
        {(sessions ?? []).map((s) => (
          <Card key={s.id}>
            <View style={styles.deviceRow}>
              <IconBadge name="phone-portrait-outline" tone="teal" size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{s.device_name ?? t('settings.unknownDevice')}</Text>
                <Caption>
                  {s.is_current ? t('settings.thisDevice') : t('settings.lastActive', { date: fmt.date(s.last_used_at) })}
                </Caption>
              </View>
              {!s.is_current && (
                <View style={{ width: 120 }}>
                  <Button title={t('settings.logOut')} variant="secondary" onPress={() => revoke(s.id)} loading={busy === s.id} />
                </View>
              )}
            </View>
          </Card>
        ))}

        <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
          {(sessions?.length ?? 0) > 1 && <Button title={t('settings.signOutAll')} variant="secondary" onPress={signOutEverywhere} loading={busy === 'all'} />}
          <Button title={t('common.signOut')} icon="log-out-outline" variant="secondary" onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});

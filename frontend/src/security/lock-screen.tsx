import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { Text } from '@/components/text';
import { BrandMark, Button, ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFormat } from '@/i18n/format';
import { useI18n } from '@/i18n/provider';

import { useAppLock } from './app-lock';
import { failureKey } from './biometrics';

/** Fully opaque cover used while saved settings load (so nothing flashes before the lock). */
export function CoverScreen() {
  const theme = useTheme();
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, zIndex: 100 }]} />;
}

export function LockScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { unlock } = useAppLock();
  const { signOut, user } = useSession();
  const fmt = useFormat();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ask for the fingerprint as soon as the lock appears.
  useEffect(() => {
    let active = true;
    unlock().then((r) => {
      if (active && !r.ok && r.reason !== 'cancelled') setMessage(t(failureKey(r.reason)));
    });
    return () => {
      active = false;
    };
  }, [unlock, t]);

  const tryAgain = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const r = await unlock();
    if (!r.ok && r.reason !== 'cancelled') setMessage(t(failureKey(r.reason)));
    setBusy(false);
  }, [unlock, t]);

  return (
    <SafeAreaView style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, zIndex: 100 }]}>
      <View style={styles.content}>
        <BrandMark size={72} />
        <View style={styles.welcome}>
          <Text style={{ color: theme.textSecondary, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{t('lock.welcomeBack')}</Text>
          {/* A long name wraps onto at most two lines and is cut with "…" after that, so it can never push the layout around. */}
          {user?.full_name ? (
            <Text numberOfLines={2} ellipsizeMode="tail" style={{ color: theme.text, fontSize: 28, fontWeight: '800', textAlign: 'center' }}>
              {fmt.name(user.full_name)}
            </Text>
          ) : (
            <Text style={{ color: theme.text, fontSize: 28, fontWeight: '800', textAlign: 'center' }}>{t('common.appName')}</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <Ionicons name="lock-closed" size={18} color={theme.textSecondary} />
          <Text style={{ color: theme.textSecondary, fontSize: 16 }}>{t('lock.subtitle')}</Text>
        </View>
        <ErrorText>{message}</ErrorText>
        <View style={styles.buttons}>
          <Button title={t('lock.unlock')} icon="finger-print" onPress={tryAgain} loading={busy} />
          <Button title={t('common.signOut')} variant="secondary" onPress={signOut} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  welcome: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 4 },
  buttons: { width: '100%', maxWidth: 360, gap: Spacing.three, marginTop: Spacing.three },
});

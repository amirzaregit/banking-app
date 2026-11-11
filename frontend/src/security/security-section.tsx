import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Text } from '@/components/text';
import { Button, Caption, Card, ErrorText, IconBadge, SectionTitle, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useI18n } from '@/i18n/provider';

import { useAppLock } from './app-lock';
import { authenticate, biometricState, failureKey, type BiometricState } from './biometrics';
import { isCompletePin, sanitizePin } from './pin-rules';
import { disableBioPay, enableBioPay, getBioPayEnabled } from './prefs';

export function SecuritySection() {
  const router = useRouter();
  const theme = useTheme();
  const { t, rtl } = useI18n();
  const describe = useErrors();
  const { user } = useSession();
  const lock = useAppLock();

  const [bio, setBio] = useState<BiometricState>('unavailable');
  const [bioPay, setBioPay] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false); // showing the "enter your PIN" panel
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      biometricState().then((s) => active && setBio(s));
      getBioPayEnabled().then((on) => active && setBioPay(on));
      return () => {
        active = false;
      };
    }, []),
  );

  const unavailable = bio !== 'ready';
  // Say WHY the switches are off, so it is clear what to do about it.
  const reason = bio === 'ready' ? null : bio === 'not-enrolled' ? t('settings.fpNotEnrolled') : t('settings.fpUnavailable');

  async function toggleLock(on: boolean) {
    setMessage(null);
    const problem = await lock.setEnabled(on);
    if (problem) setMessage(problem);
  }

  async function toggleBioPay(on: boolean) {
    setMessage(null);
    if (!on) {
      await disableBioPay();
      setBioPay(false);
      return;
    }
    if (!user?.has_pin) return setMessage(t('settings.setPinFirst'));
    if (bio !== 'ready') return setMessage(reason);
    setEnrolling(true); // we need the PIN once, to store it behind the fingerprint
  }

  async function confirmEnrol() {
    setBusy(true);
    setMessage(null);
    try {
      // The SERVER confirms the PIN is right (and counts wrong guesses toward the lockout).
      await api('/users/me/pin/verify', { method: 'POST', body: { pin } });
      const result = await authenticate(t('done.offerPrompt'));
      if (!result.ok) {
        if (result.reason !== 'cancelled') setMessage(t(failureKey(result.reason)));
      } else {
        await enableBioPay(pin);
        setBioPay(true);
        setEnrolling(false);
      }
      setPin('');
    } catch (e) {
      setPin('');
      setMessage(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <SectionTitle>{t('settings.security')}</SectionTitle>

      <Card>
        <Row
          icon="keypad-outline"
          title={t('settings.pin')}
          sub={user?.has_pin ? t('settings.pinSet') : t('settings.pinNotSet')}
          right={<Button title={user?.has_pin ? t('common.change') : t('settings.setPin')} variant="secondary" onPress={() => router.push('/security/pin')} />}
        />
      </Card>

      <Card>
        <Row
          icon="finger-print"
          title={t('settings.unlock')}
          sub={unavailable ? reason! : t('settings.unlockSub')}
          right={<Switch accessibilityLabel={t('settings.unlock')} value={lock.enabled} onValueChange={toggleLock} disabled={unavailable} trackColor={{ true: theme.primary, false: theme.border }} />}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Row
          icon="finger-print"
          title={t('settings.payFp')}
          sub={unavailable ? reason! : t('settings.payFpSub')}
          right={<Switch accessibilityLabel={t('settings.payFp')} value={bioPay} onValueChange={toggleBioPay} disabled={unavailable} trackColor={{ true: theme.primary, false: theme.border }} />}
        />
      </Card>

      {enrolling ? (
        <Card>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{t('settings.enterPinOnce')}</Text>
          <Caption>{t('settings.pinStored')}</Caption>
          <TextField label={t('settings.pin')} value={pin} onChangeText={(v) => setPin(sanitizePin(v))} secureTextEntry keyboardType="number-pad" maxLength={6} autoFocus />
          <View style={{ gap: Spacing.two }}>
            <Button title={t('common.continue')} onPress={confirmEnrol} loading={busy} disabled={!isCompletePin(pin)} />
            <Button
              title={t('common.cancel')}
              variant="secondary"
              onPress={() => {
                setEnrolling(false);
                setPin('');
              }}
            />
          </View>
        </Card>
      ) : null}

      <ErrorText>{message}</ErrorText>

      <Card onPress={() => router.push('/security/messages')}>
        <Row
          icon="chatbubble-ellipses-outline"
          title={t('settings.messages')}
          sub={t('settings.messagesSub')}
          right={<Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={22} color={theme.textSecondary} />}
        />
      </Card>
    </View>
  );
}

function Row({ icon, title, sub, right }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; right: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <IconBadge name={icon} tone="teal" size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{title}</Text>
        <Caption>{sub}</Caption>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.two },
});

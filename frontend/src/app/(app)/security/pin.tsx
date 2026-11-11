import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';

import { api } from '@/api/client';
import { useSession } from '@/auth/session';
import { Body, Button, ErrorText, FormScreen, TextField, Title } from '@/components/ui';
import { useErrors } from '@/i18n/errors';
import { useI18n } from '@/i18n/provider';
import { isCompletePin, sanitizePin } from '@/security/pin-rules';
import { disableBioPay } from '@/security/prefs';

export default function PinScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const describe = useErrors();
  const { user, refreshUser } = useSession();
  const pinRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (!password) return setError(t('pin.needPassword'));
    if (!isCompletePin(pin)) return setError(t('pin.format'));
    if (pin !== confirm) return setError(t('pin.mismatch'));

    setError(null);
    setBusy(true);
    try {
      await api('/users/me/pin', { method: 'PUT', body: { pin, password } });
      await disableBioPay(); // a PIN stored behind the fingerprint is now out of date
      await refreshUser();
      router.back();
    } catch (e) {
      setError(describe(e));
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Title>{user?.has_pin ? t('pin.changeTitle') : t('pin.setTitle')}</Title>
      <Body muted>{t('pin.intro')}</Body>
      <TextField
        label={t('pin.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        returnKeyType="next"
        onSubmitEditing={() => pinRef.current?.focus()}
      />
      <TextField
        ref={pinRef}
        label={t('pin.newPin')}
        value={pin}
        onChangeText={(v) => setPin(sanitizePin(v))}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <TextField
        ref={confirmRef}
        label={t('pin.repeat')}
        value={confirm}
        onChangeText={(v) => setConfirm(sanitizePin(v))}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title={user?.has_pin ? t('pin.change') : t('pin.save')} onPress={submit} loading={busy} />
    </FormScreen>
  );
}

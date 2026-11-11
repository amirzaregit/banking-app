import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TextInputInstance } from 'react-native';

import { useSession } from '@/auth/session';
import { Text } from '@/components/text';
import { BrandMark, Button, ErrorText, FormScreen, LanguageSwitcher, TextField, TextLink, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';
import { useI18n } from '@/i18n/provider';

const MIN_PASSWORD = 8; // same rule as the backend

export default function SignUp() {
  const { signUp } = useSession();
  const theme = useTheme();
  const { t } = useI18n();
  const describe = useErrors();
  const emailRef = useRef<TextInputInstance>(null);
  const phoneRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    // Quick local checks for instant feedback; the server remains the real authority.
    if (!name.trim()) return setError(t('auth.nameRequired'));
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t('auth.emailInvalid'));
    if (phone.replace(/\D/g, '').length < 10) return setError(t('auth.phoneRequired'));
    if (password.length < MIN_PASSWORD) return setError(t('auth.passwordShort', { min: MIN_PASSWORD }));

    setError(null);
    setBusy(true);
    try {
      await signUp(name, email, phone, password);
    } catch (e) {
      setError(describe(e));
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <LanguageSwitcher />
      <View style={styles.brand}>
        <BrandMark />
        <Title>{t('auth.createTitle')}</Title>
        <Text style={{ color: theme.textSecondary, fontSize: 16 }}>{t('auth.createSubtitle')}</Text>
      </View>
      <TextField
        label={t('auth.fullName')}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => phoneRef.current?.focus()}
      />
      <TextField
        ref={phoneRef}
        label={t('auth.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        placeholder={t('send.phonePlaceholder')}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label={t('auth.passwordMin', { min: MIN_PASSWORD })}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title={t('auth.createButton')} onPress={submit} loading={busy} />
      <View style={styles.footer}>
        <Text style={{ color: theme.textSecondary, fontSize: 15 }}>{t('auth.haveAccount')}</Text>
        <TextLink href="/sign-in">{t('auth.signInLink')}</TextLink>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  brand: { gap: Spacing.two, marginVertical: Spacing.two },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});

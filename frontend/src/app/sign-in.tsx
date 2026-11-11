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

export default function SignIn() {
  const { signIn } = useSession();
  const theme = useTheme();
  const { t } = useI18n();
  const describe = useErrors();
  const passwordRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function submit() {
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password); // on success the guard swaps screens for us
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
        <Title>{t('auth.welcomeBack')}</Title>
        <Text style={{ color: theme.textSecondary, fontSize: 16 }}>{t('auth.signInSubtitle')}</Text>
      </View>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title={t('auth.signIn')} onPress={submit} loading={busy} disabled={!canSubmit} />
      <View style={styles.footer}>
        <Text style={{ color: theme.textSecondary, fontSize: 15 }}>{t('auth.newHere')}</Text>
        <TextLink href="/sign-up">{t('auth.createAccountLink')}</TextLink>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  brand: { gap: Spacing.two, marginVertical: Spacing.two },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});

import { DarkTheme, DefaultTheme, LocaleProvider, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';

import { SessionProvider, useSession } from '@/auth/session';
import { Colors } from '@/constants/theme';
import { fontAssets } from '@/i18n/font-assets';
import { fontFamily } from '@/i18n/fonts';
import { type Lang } from '@/i18n';
import { I18nProvider, useI18n } from '@/i18n/provider';
import { AppLockProvider, useAppLock } from '@/security/app-lock';
import { CoverScreen, LockScreen } from '@/security/lock-screen';

// Keep the splash screen up until fonts, language and the saved session are all known.
SplashScreen.preventAutoHideAsync();

/** React Navigation's theme (headers, tab bar, transitions) in OUR colors and OUR per-language fonts. */
function navigationTheme(scheme: 'light' | 'dark', lang: Lang): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  const font = (weight: Parameters<typeof fontFamily>[1], fontWeight: '400' | '600' | '700' | '800') => ({ fontFamily: fontFamily(lang, weight), fontWeight });
  return {
    ...base,
    colors: { ...base.colors, primary: c.primaryText, background: c.background, card: c.background, text: c.text, border: c.border, notification: c.gold },
    fonts: { regular: font('regular', '400'), medium: font('semibold', '600'), bold: font('bold', '700'), heavy: font('extrabold', '800') },
  };
}

function Shell({ signedIn }: { signedIn: boolean }) {
  const { ready, locked } = useAppLock();
  const { direction } = useI18n();
  // Covered whenever signed in and either still loading settings or locked.
  const covered = signedIn && (!ready || locked);

  return (
    // `direction` flips every row, start/end margin and absolute position below, the moment the language changes.
    <LocaleProvider direction={direction}>
    <View style={{ flex: 1, direction }}>
      {/* The screens stay mounted underneath (so a half-finished payment survives a lock),
          but are hidden from screen readers while covered. */}
      <View style={{ flex: 1 }} accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
        <Stack screenOptions={{ headerShown: false }}>
          {/* Screens in a Protected block exist only while the guard is true. */}
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" />
          </Stack.Protected>
        </Stack>
      </View>
      {covered ? ready ? <LockScreen /> : <CoverScreen /> : null}
    </View>
    </LocaleProvider>
  );
}

function RootNavigator() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  // key={status}: every sign-in / sign-out starts with a brand-new lock state, so nothing
  // (like "locked" or "fingerprint on") can leak from one session or user to the next.
  return (
    <AppLockProvider key={status}>
      <Shell signedIn={status === 'signedIn'} />
    </AppLockProvider>
  );
}

function ThemedApp() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { lang } = useI18n();
  return (
    <ThemeProvider value={navigationTheme(scheme, lang)}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  if (!fontsLoaded && !fontError) return null; // splash stays up while the fonts load
  return (
    <I18nProvider>
      <ThemedApp />
    </I18nProvider>
  );
}

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme, View } from 'react-native';

import { AppHeader } from '@/components/app-header';
import { PatternBackground } from '@/components/pattern-background';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';
import { DraftProvider } from '@/send/draft';

export default function AppLayout() {
  const theme = useTheme();
  // React Navigation paints `colors.background` under every screen, and a screen's own style cannot undo that. So inside the
  // signed-in app the navigation theme's background is transparent, and the shared pattern below shows through.
  const base = useColorScheme() === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: 'transparent', card: 'transparent' } };
  const { t } = useI18n();
  return (
    // The draft payment lives here so every step of the send flow can read and update it.
    <ThemeProvider value={navTheme}>
    <DraftProvider>
      {/* ONE background for the whole signed-in app, behind every screen. Screens are transparent and fade into each other, so
          the pattern never jumps. (Sign-in, sign-up and the lock screen are outside this view and stay plain.) */}
      <View style={{ flex: 1, backgroundColor: theme.background }}>
      <PatternBackground />
      <Stack
        screenOptions={{
          header: (props) => <AppHeader {...props} />, // our own header: it mirrors instantly with the language
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'fade',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: t('titles.notifications') }} />
        <Stack.Screen name="transfer" options={{ title: t('titles.transfer') }} />
        <Stack.Screen name="topup" options={{ title: t('titles.topup') }} />
        <Stack.Screen name="request" options={{ title: t('titles.request') }} />
        <Stack.Screen name="pay-link" options={{ title: t('titles.payLink') }} />
        <Stack.Screen name="scan" options={{ title: t('titles.scan') }} />
        <Stack.Screen name="bills/index" options={{ title: t('titles.bills') }} />
        <Stack.Screen name="bills/pay" options={{ title: t('titles.billPay') }} />
        <Stack.Screen name="insurance/index" options={{ title: t('titles.insurance') }} />
        <Stack.Screen name="insurance/buy" options={{ title: t('titles.insuranceBuy') }} />
        <Stack.Screen name="insurance/policy" options={{ title: t('titles.policy') }} />
        <Stack.Screen name="gift" options={{ title: t('titles.gift') }} />
        <Stack.Screen name="news/[id]" options={{ title: t('titles.article') }} />
        <Stack.Screen name="convert" options={{ title: t('titles.convert') }} />
        <Stack.Screen name="documents" options={{ title: t('titles.documents') }} />
        <Stack.Screen name="rates" options={{ title: t('titles.rates') }} />
        <Stack.Screen name="branches" options={{ title: t('titles.branches') }} />
        <Stack.Screen name="support" options={{ title: t('titles.support') }} />
        <Stack.Screen name="account/[id]" options={{ title: t('titles.account') }} />
        <Stack.Screen name="transaction" options={{ title: t('titles.transaction') }} />
        <Stack.Screen name="account-history" options={{ title: t('titles.accountHistory') }} />
        <Stack.Screen name="card-order" options={{ title: t('titles.cardOrder') }} />
        <Stack.Screen name="block" options={{ title: t('titles.block') }} />
        <Stack.Screen name="security/pin" options={{ title: t('titles.paymentPin') }} />
        <Stack.Screen name="security/messages" options={{ title: t('titles.messages') }} />
        <Stack.Screen name="send/amount" options={{ title: t('titles.amount') }} />
        <Stack.Screen name="send/review" options={{ title: t('titles.review') }} />
        {/* After a successful payment there is no going back to the review screen. */}
        <Stack.Screen name="send/done" options={{ title: t('titles.sent'), headerBackVisible: false, gestureEnabled: false }} />
      </Stack>
      </View>
    </DraftProvider>
    </ThemeProvider>
  );
}

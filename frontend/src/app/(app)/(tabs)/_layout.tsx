import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/glass';
import { useTheme } from '@/hooks/use-theme';
import { fontFamily } from '@/i18n/fonts';
import { useI18n } from '@/i18n/provider';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const theme = useTheme();
  const { t, lang } = useI18n();
  // The phone's own gesture bar / 3-button navigation sits in the bottom inset. Lift the bar by that much (plus a little
  // air), so it never collides with the system navigation on any phone.
  const insets = useSafeAreaInsets();
  const lift = Math.max(insets.bottom, 10) + 6;
  const icon = (outline: IconName, filled: IconName) =>
    function TabIcon({ color, size, focused }: { color: string | unknown; size: number; focused: boolean }) {
      // The active tab gets a soft teal pill behind its icon.
      return (
        <View style={{ width: 58, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: focused ? theme.backgroundSelected : 'transparent' }}>
          <Ionicons name={focused ? filled : outline} size={size} color={color as string} />
        </View>
      );
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        // the glass bar: a translucent panel over the shared pattern (it extends below the screen so only its top corners show)
        tabBarBackground: () => <Glass radius={26} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -40 }} />,
        tabBarActiveTintColor: theme.primaryText, // the deeper teal: readable (4.5:1) on the bar
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: { fontFamily: fontFamily(lang, 'semibold'), fontSize: 12, marginTop: 2 },
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          // 72 = 8 (top padding) + 32 (icon pill) + label + air: tall enough that nothing is ever clipped on a phone
          height: 74 + lift,
          paddingTop: 8,
          paddingBottom: lift,
          // a soft shadow lifts the bar off the page
          elevation: 0,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="history" options={{ title: t('tabs.history'), tabBarIcon: icon('time-outline', 'time') }} />
      <Tabs.Screen name="payments" options={{ title: t('tabs.payments'), tabBarIcon: icon('swap-horizontal-outline', 'swap-horizontal') }} />
      <Tabs.Screen name="news" options={{ title: t('tabs.news'), tabBarIcon: icon('newspaper-outline', 'newspaper') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarIcon: icon('settings-outline', 'settings') }} />
    </Tabs>
  );
}

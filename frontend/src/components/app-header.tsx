import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';

import { Text } from './text';

type HeaderProps = {
  options: { title?: string; headerBackVisible?: boolean };
  back?: unknown; // present when there is a screen to go back to
  navigation: { goBack: () => void };
};

/**
 * The screen header, drawn by the app instead of the phone's native header. The native header takes
 * its direction from the phone's own RTL setting (which we do not use), so a custom one is the only
 * way for the back arrow to mirror the moment the language changes.
 */
export function AppHeader({ options, back, navigation }: HeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { rtl, t } = useI18n();
  const showBack = Boolean(back) && options.headerBackVisible !== false;

  return (
    <View style={{ paddingTop: insets.top }}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {showBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={navigation.goBack} hitSlop={12} style={styles.backButton}>
              {/* "back" points toward the start edge: left in English/Russian, right in Persian */}
              <Ionicons name={rtl ? 'chevron-forward' : 'chevron-back'} size={26} color={theme.text} />
            </Pressable>
          ) : null}
        </View>
        <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', color: theme.text, fontSize: 17, fontWeight: '700' }}>
          {options.title}
        </Text>
        <View style={styles.side} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  side: { width: 48, alignItems: 'center', justifyContent: 'center' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

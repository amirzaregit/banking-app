import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';

/** "November 2026 · 12" with a chevron: tap to fold the month away or open it again. */
export function MonthHeader({ label, count, open, onPress }: { label: string; count: number; open: boolean; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}, ${t('history.count', { count })}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
      <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '800' }}>{label}</Text>
      <View style={[styles.count, { backgroundColor: theme.backgroundSelected }]}>
        <Text style={{ color: theme.primaryText, fontSize: 12, fontWeight: '800' }}>{count}</Text>
      </View>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: 10, marginTop: Spacing.three },
  count: { minWidth: 26, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});

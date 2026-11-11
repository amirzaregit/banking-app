import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChipOption<T extends string> = { value: T; label: string };

/** A wrapping group of selectable pills (wraps instead of scrolling, so it behaves the same left-to-right and right-to-left). */
export function FilterChips<T extends string>({ options, value, onChange }: { options: ChipOption<T>[]; value: T; onChange: (value: T) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected ? { backgroundColor: theme.primary, borderColor: theme.primary } : { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: selected ? '700' : '600', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1.5, minHeight: 40, justifyContent: 'center' },
});

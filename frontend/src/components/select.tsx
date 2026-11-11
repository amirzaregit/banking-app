import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';

import { Text } from './text';
import { Button } from './ui';

export type SelectOption = { value: string; label: string; group?: string; leading?: React.ReactNode };

/** A field that opens a bottom sheet of choices (a "select box"). Options with a `group` get a small heading. */
export function Select({ label, value, options, onChange, icon }: { label: string; value: string; options: SelectOption[]; onChange: (value: string) => void; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, { backgroundColor: theme.backgroundElement, borderColor: open ? theme.primary : theme.border, opacity: pressed ? 0.85 : 1 }]}>
        {current?.leading ?? (icon ? <Ionicons name={icon} size={20} color={theme.primaryText} /> : null)}
        <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 16, fontWeight: '600' }}>
          {current?.label ?? ''}
        </Text>
        <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
      </Pressable>

      <OptionSheet visible={open} title={label} value={value} options={options} onSelect={onChange} onClose={() => setOpen(false)} />
    </View>
  );
}

/** The bottom sheet listing the choices. Shared by Select and by anything else that needs a picker (e.g. a currency badge). */
export function OptionSheet({ visible, title, value, options, onSelect, onClose }: { visible: boolean; title: string; value: string; options: SelectOption[]; onSelect: (value: string) => void; onClose: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('pickers.close')} />
      <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{title}</Text>
        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: Spacing.one }}>
          {options.map((o, i) => {
            const selected = o.value === value;
            const heading = o.group && o.group !== options[i - 1]?.group ? o.group : null;
            return (
              <View key={o.value}>
                {heading ? <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700', marginTop: Spacing.two, marginBottom: 4 }}>{heading}</Text> : null}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={o.label}
                  onPress={() => {
                    onSelect(o.value);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.option, { backgroundColor: selected ? theme.backgroundSelected : 'transparent', opacity: pressed ? 0.8 : 1 }]}>
                  {o.leading}
                  <Text style={{ flex: 1, color: selected ? theme.primaryText : theme.text, fontSize: 16, fontWeight: selected ? '800' : '600' }}>{o.label}</Text>
                  {selected ? <Ionicons name="checkmark-circle" size={22} color={theme.primaryText} /> : null}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
        <Button title={t('pickers.close')} variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

export const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { padding: Spacing.four, gap: Spacing.three, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, width: '100%', maxWidth: MaxContentWidth / 2, alignSelf: 'center' },
});

const styles = {
  ...sheetStyles,
  ...StyleSheet.create({
    field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: Spacing.three },
    option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 48, borderRadius: Radius.md, paddingHorizontal: Spacing.three },
  }),
};

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';
import { PIN_LENGTH } from '@/security/pin-rules';

import { Glass } from './glass';
import { Text } from './text';

// Set inline: react-native-web rejects `direction` inside StyleSheet.create.
const LTR = { direction: 'ltr' } as const;

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

/**
 * Typing a PIN or a one-time code, the way banking apps do: the digits become dots (or boxes that show the digits), and
 * an on-screen keypad takes the place of the phone's keyboard. So nothing slides up over the screen, the PIN is never
 * shown, and the numbers are always the same size and place. The keys are always the Latin digits 0-9 and the cells fill
 * from left to right, in every language (the PIN itself is plain ASCII digits everywhere, also on the server); only the
 * digits shown inside the code boxes follow the language. On the web a real keyboard works too.
 * `error` turns the dots red and shakes them once (a wrong PIN or code).
 */
export function PinEntry({ value, onChange, secure = true, error = false, disabled = false, length = PIN_LENGTH, label }: { value: string; onChange: (value: string) => void; secure?: boolean; error?: boolean; disabled?: boolean; length?: number; label: string }) {
  const theme = useTheme();
  const { t } = useI18n();
  const [shake] = useState(() => new Animated.Value(0));

  const press = (digit: string) => !disabled && value.length < length && onChange(value + digit);
  const erase = () => !disabled && onChange(value.slice(0, -1));

  // One short left-right shake when an error appears.
  useEffect(() => {
    if (!error) return;
    Animated.sequence([-10, 10, -8, 8, 0].map((to) => Animated.timing(shake, { toValue: to, duration: 55, useNativeDriver: true }))).start();
  }, [error, shake]);

  // The web has a real keyboard: digits and backspace work there as well.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') erase();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const filledColor = error ? theme.danger : theme.primary;

  return (
    <View style={{ gap: Spacing.three }}>
      <Animated.View
        accessibilityLabel={`${label}: ${value.length}/${length}`}
        accessibilityRole="text"
        style={[styles.cells, LTR, { transform: [{ translateX: shake }] }]}>
        {Array.from({ length }, (_, i) => {
          const filled = i < value.length;
          return secure ? (
            <View key={i} style={[styles.dot, { borderColor: error ? theme.danger : filled ? theme.primary : theme.border, backgroundColor: filled ? filledColor : 'transparent' }]} />
          ) : (
            <View key={i} style={[styles.box, { borderColor: error ? theme.danger : i === value.length ? theme.primary : theme.border, backgroundColor: theme.backgroundElement }]}>
              <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </Animated.View>

      {/* The keypad is laid out left-to-right in every language, like a phone's dial pad. */}
      <View style={[styles.pad, LTR]}>
        {ROWS.map((row) => (
          <View key={row[0]} style={[styles.padRow, LTR]}>
            {row.map((d) => (
              <Key key={d} label={d} onPress={() => press(d)} disabled={disabled} />
            ))}
          </View>
        ))}
        <View style={[styles.padRow, LTR]}>
          <View style={styles.key} />
          <Key label="0" onPress={() => press('0')} disabled={disabled} />
          <Key icon="backspace-outline" accessibilityLabel={t('pin.erase')} onPress={erase} disabled={disabled || value.length === 0} />
        </View>
      </View>
    </View>
  );
}

function Key({ label, icon, onPress, disabled, accessibilityLabel }: { label?: string; icon?: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.key}>
      <Glass radius={Radius.lg} style={{ flex: 1, opacity: disabled ? 0.45 : 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.keyPress, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
          {label ? <Text lang="en" style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>{label}</Text> : <Ionicons name={icon!} size={26} color={theme.text} />}
        </Pressable>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  box: { width: 46, height: 56, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pad: { gap: Spacing.two, alignItems: 'center' },
  padRow: { flexDirection: 'row', gap: Spacing.two },
  key: { width: 92, height: 60 },
  keyPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

import { View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { CURRENCY_GLYPH } from '@/lib/money';

import { Text } from './text';

/** A round badge with the currency's sign ($, ₽, ﷼), so accounts are told apart by what they hold, not by a number. */
export function CurrencyDot({ code, size = 28 }: { code: string; size?: number }) {
  const theme = useTheme();
  return (
    // Decorative: the label next to it already names the currency.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: theme.onGold, fontSize: size * 0.52, fontWeight: '800', textAlign: 'center', includeFontPadding: false }}>{CURRENCY_GLYPH[code] ?? code[0]}</Text>
    </View>
  );
}

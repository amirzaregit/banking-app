import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * A frosted-glass surface: the pattern behind it is blurred, the fill is translucent, and a fine light edge catches the
 * light along the top. Light mode is milky white glass; dark mode is smoked glass.
 * The background behind it is already blurred, so on phones the glass is a translucent fill plus the bright edge (many blur
 * layers on one screen are slow on Android); on the web the browser's own `backdrop-filter` adds a little extra frost.
 */
export function Glass({ children, style, radius = 22 }: { children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number }) {
  const dark = useColorScheme() === 'dark';
  const base: ViewStyle = {
    borderRadius: radius,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)',
    backgroundColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.58)',
  };
  // the web's blur is a style, not a component
  const webBlur = Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px) saturate(1.5)', WebkitBackdropFilter: 'blur(18px) saturate(1.5)' } as ViewStyle) : null;

  return (
    <View style={[base, webBlur, style]}>
      <View pointerEvents="none" style={[styles.edge, { backgroundColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.95)' }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', top: 0, left: 12, right: 12, height: StyleSheet.hairlineWidth * 2 },
});

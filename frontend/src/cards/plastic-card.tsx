import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';

import { CardArt } from './card-art';

export type PlasticTheme = 'light' | 'dark';

// A real plastic card looks the same in every app theme, so these colors are the card's own, not the app's palette.
const LOOK: Record<PlasticTheme, { bg: string; ink: string; muted: string; accent: string; edge: string }> = {
  light: { bg: '#F7F7F7', ink: '#13292B', muted: '#4F6769', accent: '#B98A3E', edge: '#D5E0E0' },
  dark: { bg: '#10191A', ink: '#F2F8F8', muted: '#9DB3B5', accent: '#E8BE7B', edge: '#263A3C' },
};

/** The card as it will be printed: a white or a dark one, with the currency's own artwork. */
export function PlasticCard({ variant, currency, holder, brand }: { variant: PlasticTheme; currency: string; holder: string; brand: string }) {
  const look = LOOK[variant];
  return (
    <View style={[styles.card, { backgroundColor: look.bg, borderColor: look.edge }]}>
      <View pointerEvents="none" style={styles.art}>
        <CardArt currency={currency} color={look.accent} />
      </View>
      <View style={styles.top}>
        <Text style={{ color: look.ink, fontSize: 15, fontWeight: '800' }}>{brand}</Text>
        <Ionicons name="wifi" size={22} color={look.muted} style={{ transform: [{ rotate: '90deg' }] }} />
      </View>
      <View style={[styles.chip, { backgroundColor: look.accent }]}>
        <View style={[styles.chipLine, { backgroundColor: look.bg }]} />
        <View style={[styles.chipLine, { backgroundColor: look.bg }]} />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={{ color: look.ink, fontSize: 20, fontWeight: '700', letterSpacing: 2, textAlign: 'left', writingDirection: 'ltr' }}>•••• •••• •••• ••••</Text>
        <Text numberOfLines={1} style={{ color: look.muted, fontSize: 13, fontWeight: '700' }}>
          {holder}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.four, gap: Spacing.three, overflow: 'hidden', minHeight: 190, justifyContent: 'space-between' },
  art: { position: 'absolute', end: 8, bottom: 6, opacity: 0.55 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { width: 44, height: 32, borderRadius: 7, justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  chipLine: { height: 2, borderRadius: 1, opacity: 0.45 },
});

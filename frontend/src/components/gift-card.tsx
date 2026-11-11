import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

export const GIFT_DESIGNS = ['wedding', 'anniversary', 'graduation', 'birthday', 'friendship', 'custom'] as const;
export type GiftDesign = (typeof GIFT_DESIGNS)[number];
export const isGiftDesign = (v: unknown): v is GiftDesign => typeof v === 'string' && (GIFT_DESIGNS as readonly string[]).includes(v);

const HEART = 'M50 90 C10 60 10 25 32 18 C44 14 50 24 50 30 C50 24 56 14 68 18 C90 25 90 60 50 90 Z';
const STAR = 'M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z';

type Colors = { gold: string; teal: string; paper: string };

function Star({ x, y, s = 1, color }: { x: number; y: number; s?: number; color: string }) {
  return <Path d={STAR} fill={color} transform={`translate(${x} ${y}) scale(${s})`} />;
}

/** The illustration for one design, in a 200 x 110 box, drawn in the brand's gold, teal and paper on the card's deep teal. */
export function GiftArt({ design, width = 240 }: { design: GiftDesign; width?: number }) {
  const theme = useTheme();
  const c: Colors = { gold: theme.gold, teal: theme.primary, paper: '#F7F7F7' };
  return (
    <Svg width={width} height={(width * 110) / 200} viewBox="0 0 200 110">
      {design === 'birthday' ? <Birthday {...c} /> : design === 'wedding' ? <Wedding {...c} /> : design === 'anniversary' ? <Anniversary {...c} /> : design === 'graduation' ? <Graduation {...c} /> : design === 'friendship' ? <Friendship {...c} /> : <Box {...c} />}
    </Svg>
  );
}

function Birthday({ gold, teal, paper }: Colors) {
  return (
    <G>
      {/* balloons */}
      <Ellipse cx="30" cy="40" rx="13" ry="16" fill={teal} />
      <Path d="M30 56 C26 72 40 84 44 100" stroke={paper} strokeWidth={1.4} fill="none" />
      <Ellipse cx="170" cy="36" rx="13" ry="16" fill={gold} />
      <Path d="M170 52 C176 70 160 84 156 100" stroke={paper} strokeWidth={1.4} fill="none" />
      <Ellipse cx="148" cy="62" rx="9" ry="11" fill={paper} />
      {/* the cake: two tiers with frosting, candles and flames */}
      <Rect x="62" y="70" width="76" height="28" rx="5" fill={gold} />
      <Path d="M62 74 q8 9 16 0 q8 9 16 0 q8 9 16 0 q8 9 16 0 q8 9 12 0 V70 H62 Z" fill={paper} />
      <Rect x="74" y="52" width="52" height="20" rx="5" fill={teal} />
      <Path d="M74 56 q6.5 8 13 0 q6.5 8 13 0 q6.5 8 13 0 q6.5 8 13 0 V52 H74 Z" fill={paper} />
      {[88, 100, 112].map((x) => (
        <G key={x}>
          <Rect x={x - 2} y={38} width={4} height={14} rx={1.5} fill={paper} />
          <Path d={`M${x} 27 C${x - 4} 32 ${x - 3} 36 ${x} 37 C${x + 3} 36 ${x + 4} 32 ${x} 27 Z`} fill={gold} />
        </G>
      ))}
      <Rect x="52" y="98" width="96" height="5" rx="2.5" fill={paper} opacity={0.85} />
      {/* confetti */}
      <Circle cx="64" cy="22" r="2.5" fill={gold} />
      <Circle cx="138" cy="20" r="2.5" fill={teal} />
      <Rect x="52" y="40" width="6" height="3" rx="1" fill={paper} transform="rotate(30 55 41)" />
      <Rect x="142" y="38" width="6" height="3" rx="1" fill={gold} transform="rotate(-25 145 39)" />
      <Star x={18} y={84} s={0.8} color={gold} />
      <Star x={184} y={80} s={0.7} color={paper} />
    </G>
  );
}

function Wedding({ gold, teal, paper }: Colors) {
  return (
    <G>
      {/* two interlocked rings, and a diamond set in one of them */}
      <Circle cx="82" cy="66" r="26" fill="none" stroke={gold} strokeWidth={7} />
      <Circle cx="118" cy="66" r="26" fill="none" stroke={paper} strokeWidth={7} />
      <Path d="M118 40 A26 26 0 0 1 134 46" fill="none" stroke={gold} strokeWidth={7} />
      <Path d="M100 12 L110 22 L100 36 L90 22 Z" fill={teal} />
      <Path d="M90 22 H110 M100 12 L95 22 L100 36 L105 22 Z" stroke={paper} strokeWidth={1.2} fill="none" />
      {/* a small heart between and sparkles around */}
      <G transform="translate(92 62) scale(0.16)">
        <Path d={HEART} fill={teal} />
      </G>
      <Star x={36} y={30} s={1.1} color={gold} />
      <Star x={166} y={32} s={1} color={paper} />
      <Star x={26} y={86} s={0.8} color={paper} />
      <Star x={176} y={88} s={0.9} color={gold} />
      <Circle cx="150" cy="14" r="2.4" fill={teal} />
      <Circle cx="48" cy="12" r="2.4" fill={gold} />
    </G>
  );
}

function Anniversary({ gold, teal, paper }: Colors) {
  return (
    <G>
      {/* a big heart with a gold highlight, champagne glasses and rising bubbles */}
      <G transform="translate(58 6) scale(0.84)">
        <Path d={HEART} fill={teal} />
        <Path d="M30 34 C24 38 24 46 30 52" stroke={gold} strokeWidth={4} fill="none" strokeLinecap="round" />
      </G>
      {/* two champagne glasses: the right one is the left one mirrored */}
      {[false, true].map((mirror) => (
        <G key={String(mirror)} transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
          <Path d="M20 30 H44 L33 56 Z" fill={paper} />
          <Rect x="31.5" y="56" width="3" height="24" fill={paper} />
          <Rect x="24" y="80" width="18" height="3" rx="1.5" fill={paper} />
          <Path d="M22.5 34 H41.5 L38 42 H26 Z" fill={gold} />
        </G>
      ))}
      {[{ x: 46, y: 18, r: 2.5 }, { x: 56, y: 10, r: 2 }, { x: 150, y: 14, r: 2.5 }, { x: 160, y: 24, r: 2 }].map((b) => (
        <Circle key={`${b.x}${b.y}`} cx={b.x} cy={b.y} r={b.r} fill={gold} />
      ))}
      <Star x={100} y={100} s={0.8} color={gold} />
      <Star x={176} y={78} s={0.9} color={paper} />
      <Star x={14} y={92} s={0.7} color={gold} />
    </G>
  );
}

function Graduation({ gold, teal, paper }: Colors) {
  return (
    <G>
      {/* the mortarboard: a flat square top, a cap beneath, and a tassel */}
      <Path d="M72 54 V76 Q100 92 128 76 V54 L100 68 Z" fill={teal} />
      <Path d="M100 18 L162 44 L100 70 L38 44 Z" fill={paper} />
      <Path d="M100 18 L162 44 L100 70 L38 44 Z" fill="none" stroke={gold} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx="100" cy="44" r="4" fill={gold} />
      <Path d="M100 44 L154 48 V80" stroke={gold} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M150 80 H158 L160 94 H148 Z" fill={gold} />
      {/* a rolled diploma tied with a ribbon */}
      <Rect x="16" y="76" width="50" height="14" rx="7" fill={paper} />
      <Rect x="36" y="76" width="7" height="14" fill={teal} />
      <Ellipse cx="16" cy="83" rx="3.5" ry="7" fill={gold} />
      <Star x={26} y={30} s={0.9} color={gold} />
      <Star x={176} y={24} s={1} color={paper} />
      <Star x={186} y={86} s={0.7} color={gold} />
    </G>
  );
}

function Friendship({ gold, teal, paper }: Colors) {
  return (
    <G>
      {/* two hearts leaning together, joined by a dotted line, with stars around */}
      <G transform="translate(36 14) scale(0.9)">
        <Path d={HEART} fill={teal} />
      </G>
      <G transform="translate(80 8) scale(1)">
        <Path d={HEART} fill={gold} />
      </G>
      <G transform="translate(108 34) scale(0.5)">
        <Path d={HEART} fill={paper} />
      </G>
      <Line x1="14" y1="100" x2="186" y2="100" stroke={paper} strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" />
      <Star x={22} y={30} s={1} color={gold} />
      <Star x={178} y={30} s={1.1} color={paper} />
      <Star x={172} y={78} s={0.8} color={gold} />
      <Star x={24} y={74} s={0.7} color={paper} />
      <Circle cx="150" cy="14" r="2.5" fill={teal} />
    </G>
  );
}

function Box({ gold, teal, paper }: Colors) {
  return (
    <G>
      {/* a gift box with a ribbon and bow */}
      <Rect x="62" y="56" width="76" height="46" rx="4" fill={teal} />
      <Rect x="56" y="44" width="88" height="16" rx="4" fill={gold} />
      <Rect x="94" y="44" width="12" height="58" fill={paper} />
      <Path d="M100 44 C78 8 56 28 100 44 Z" fill={paper} />
      <Path d="M100 44 C122 8 144 28 100 44 Z" fill={paper} />
      <Circle cx="100" cy="44" r="5" fill={gold} />
      <Star x={30} y={36} s={1.2} color={gold} />
      <Star x={172} y={30} s={1} color={paper} />
      <Star x={28} y={84} s={0.8} color={paper} />
      <Star x={176} y={84} s={1} color={gold} />
      <Circle cx="150" cy="70" r="2.5" fill={gold} />
      <Circle cx="48" cy="62" r="2.5" fill={teal} />
    </G>
  );
}

/** A finished greeting card: the illustration, the message, and who it is from. */
export function GiftCard({ design, message, from, compact }: { design: GiftDesign; message: string; from?: string; compact?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.hero }]}>
      <View style={[styles.glow, { backgroundColor: theme.gold }]} />
      <View style={{ alignItems: 'center' }}>
        <GiftArt design={design} width={compact ? 150 : 230} />
      </View>
      {message ? (
        <Text numberOfLines={compact ? 2 : 6} style={{ color: theme.onHero, fontSize: compact ? 14 : 17, fontWeight: '700', textAlign: 'center' }}>
          {message}
        </Text>
      ) : null}
      {from ? <Text style={{ color: theme.onHeroMuted, fontSize: 13, textAlign: 'center' }}>{from}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg + 6, padding: Spacing.four, gap: Spacing.two, overflow: 'hidden' },
  glow: { position: 'absolute', top: -60, start: -40, width: 160, height: 160, borderRadius: 80, opacity: 0.14 },
});

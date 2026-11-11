import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useColorScheme } from '@/hooks/use-color-scheme';

/** Which pattern to draw: the round rosettes, or the Moorish lattice of stepped squares. Change this one word to compare. */
export const BACKGROUND_PATTERN: 'rosette' | 'lattice' = 'rosette';

// The blur is drawn, not filtered: every line is several overlapping strokes, so it looks the same on every phone and in the
// browser and costs nothing to render.
/**
 * Six strokes per line, from very wide and very faint to thin and strong. Stacked, they fade out gradually on both sides of
 * the line like a Gaussian blur: the wider the widest stroke, the blurrier the pattern. `BLUR` scales all the widths at once
 * (1 = the current look, 0.5 = half as blurry, 2 = twice as blurry); `BOOST` makes up for the contrast a blur loses.
 */
const BLUR = 1;
const BOOST = 0.75;
const LAYERS = [
  { width: 34, opacity: 0.05 },
  { width: 22, opacity: 0.07 },
  { width: 14, opacity: 0.09 },
  { width: 8, opacity: 0.13 },
  { width: 4, opacity: 0.18 },
  { width: 1.8, opacity: 0.22 },
];
const SOFT = {
  lattice: LAYERS.map((l) => ({ width: Math.max(1.6, l.width * BLUR), opacity: l.opacity * BOOST })),
  rosette: LAYERS.map((l) => ({ width: Math.max(1.4, l.width * 0.8 * BLUR), opacity: l.opacity * BOOST })),
};

// ---- the Moorish lattice -------------------------------------------------------------------------------------------------

const LATTICE_TILE = 112; // about 3.5 shapes across a phone

/**
 * One cell of the lattice, measured from the picture: a square with a pointed arrowhead on each side. The tips sit on the
 * middle of the cell's edges, so a neighbour's tip lands on the same point and the two Vs cross into an "X".
 */
function cellPath(size: number): string {
  const c = size / 2;
  const s = size * 0.35;
  const b = size * 0.1;
  const h = size * 0.15;
  return [
    `M${c - s} ${c - s}`,
    `H${c - b} L${c} ${c - s - h} L${c + b} ${c - s} H${c + s}`,
    `V${c - b} L${c + s + h} ${c} L${c + s} ${c + b} V${c + s}`,
    `H${c + b} L${c} ${c + s + h} L${c - b} ${c + s} H${c - s}`,
    `V${c + b} L${c - s - h} ${c} L${c - s} ${c - b} Z`,
  ].join(' ');
}

// ---- the rosettes ---------------------------------------------------------------------------------------------------------

const ROSETTE_TILE = 240; // rosettes sit on the middle of each edge of this tile

/** One rosette: beaded rings, twelve petals, and a small inner flower, as fine outlines. `w` is the stroke width. */
function Rosette({ cx, cy, w }: { cx: number; cy: number; w: number }) {
  const thin = w * 0.62;
  const beads = (radius: number, count: number, size: number) =>
    Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      return <Circle key={`${radius}-${i}`} cx={Math.cos(a) * radius} cy={Math.sin(a) * radius} r={size} />;
    });
  const petals = Array.from({ length: 12 }, (_, i) => (
    <G key={i} rotation={i * 30}>
      <Path d="M27 0 C38 -15 58 -15 70 0 C58 15 38 15 27 0 Z" />
      <Path d="M36 0 C43 -7 54 -7 61 0" strokeWidth={thin} />
    </G>
  ));
  const smallPetals = Array.from({ length: 8 }, (_, i) => (
    <G key={i} rotation={i * 45 + 22.5}>
      <Path d="M9 0 C13 -6 19 -6 23 0 C19 6 13 6 9 0 Z" strokeWidth={thin} />
    </G>
  ));
  return (
    <G x={cx} y={cy} strokeWidth={w}>
      <Circle r={104} />
      <Circle r={99} strokeWidth={thin} />
      {beads(91, 30, 2.1)}
      <Circle r={84} strokeWidth={thin} />
      <Circle r={78} />
      {petals}
      <Circle r={26} />
      {smallPetals}
      <Circle r={8} />
      <Circle r={3} />
    </G>
  );
}

/**
 * The app's backdrop: a faint pattern on the theme's background, with two soft colour glows behind it. Frosted-glass
 * surfaces on top blur this, which is what makes them look like glass. Sits behind everything and never takes touches.
 * Light mode uses teal lines on paper; dark mode uses pale teal lines on deep teal-black.
 */
export function PatternBackground() {
  const dark = useColorScheme() === 'dark';
  const line = dark ? '#8FDDE0' : '#00A5AC';
  const lineOpacity = dark ? 0.1 : 0.16;
  const tile = BACKGROUND_PATTERN === 'rosette' ? ROSETTE_TILE : LATTICE_TILE;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glowTeal" cx="0.88" cy="0.08" r="0.65">
            <Stop offset="0" stopColor="#00A5AC" stopOpacity={dark ? 0.34 : 0.26} />
            <Stop offset="1" stopColor="#00A5AC" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowGold" cx="0.08" cy="0.82" r="0.7">
            <Stop offset="0" stopColor="#DEAD61" stopOpacity={dark ? 0.2 : 0.3} />
            <Stop offset="1" stopColor="#DEAD61" stopOpacity={0} />
          </RadialGradient>
          <Pattern id="backdrop" x={0} y={0} width={tile} height={tile} patternUnits="userSpaceOnUse">
            {SOFT[BACKGROUND_PATTERN].map((layer) => (
              <G key={layer.width} fill="none" stroke={line} strokeOpacity={lineOpacity * layer.opacity} strokeLinecap="round" strokeLinejoin="round">
                {BACKGROUND_PATTERN === 'rosette' ? (
                  <>
                    <Rosette cx={0} cy={tile / 2} w={layer.width} />
                    <Rosette cx={tile} cy={tile / 2} w={layer.width} />
                    <Rosette cx={tile / 2} cy={0} w={layer.width} />
                    <Rosette cx={tile / 2} cy={tile} w={layer.width} />
                  </>
                ) : (
                  <Path d={cellPath(tile)} strokeWidth={layer.width} />
                )}
              </G>
            ))}
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#backdrop)" />
        <Rect width="100%" height="100%" fill="url(#glowTeal)" />
        <Rect width="100%" height="100%" fill="url(#glowGold)" />
      </Svg>
    </View>
  );
}

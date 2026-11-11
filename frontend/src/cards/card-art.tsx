import { Image } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path } from 'react-native-svg';

/**
 * Artwork for a virtual card, one per currency, all drawn in the same clean OUTLINE style (round-capped gold lines,
 * no fills), so the three cards belong together:
 *   IRR: Azadi Tower (Tehran)    USD: a globe    (drawn as vector shapes in a 160 x 110 box)
 *   RUB: St. Basil's Cathedral (Moscow), from the supplied line drawing: a white-on-transparent PNG that is tinted gold
 */
const BASILS = require('../../assets/card-art/basils.png');
const BASILS_RATIO = 592 / 772; // width / height of the picture
export const ART_WIDTH = 160;
export const ART_HEIGHT = 110;

export function CardArt({ currency, color }: { currency: string; color: string }) {
  if (currency === 'RUB') {
    return <Image source={BASILS} resizeMode="contain" style={{ width: ART_HEIGHT * BASILS_RATIO, height: ART_HEIGHT, tintColor: color }} />;
  }
  return (
    <Svg width={ART_WIDTH} height={ART_HEIGHT} viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`}>
      <G fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {currency === 'IRR' ? <Iran /> : <World color={color} />}
      </G>
    </Svg>
  );
}

/** Azadi Tower: a tall block with slits, two side wings, flared legs, and a pointed arch with a rounded arch inside. */
function Azadi() {
  const slits = [36, 40.7, 45.4, 50, 54.6, 59.3, 64];
  return (
    <G transform="translate(30 8)">
      {/* the central block, open at the bottom where it flows into the legs */}
      <Path d="M30 52 V6 H70 V52" />
      {slits.map((x) => (
        <Line key={x} x1={x} y1={14} x2={x} y2={26} strokeWidth={2.6} />
      ))}
      {/* the two lower side wings behind the block */}
      <Path d="M21 58 V14 H30" />
      <Path d="M79 58 V14 H70" />
      {/* the legs flaring out to the ground */}
      <Path d="M30 52 L2 98" />
      <Path d="M70 52 L98 98" />
      {/* the great pointed arch, and the rounded arch nested inside it */}
      <Path d="M34 98 L35.5 80 C37 68 44 60 50 53 C56 60 63 68 64.5 80 L66 98" />
      <Path d="M40 98 L41 80 C42 70 46 65 50 65 C54 65 58 70 59 80 L60 98" />
    </G>
  );
}

function Iran() {
  return <Azadi />;
}

/** A globe: outline, equator, two parallels, a central and a curved meridian, and outlined land masses clipped to the sphere. */
function World({ color }: { color: string }) {
  // Drawn at full size, then scaled to 70% about its middle so it is as big as the landmark skylines, not bigger.
  // (Stroke widths below are divided by that scale, so the lines come out as thick as the other artworks' lines.)
  return (
    <G transform="translate(80 56) scale(0.7) translate(-80 -55)" strokeWidth={3.1}>
      <Defs>
        <ClipPath id="globe">
          <Circle cx="80" cy="55" r="48" />
        </ClipPath>
      </Defs>
      <Circle cx="80" cy="55" r="48" />
      <Ellipse cx="80" cy="55" rx="20" ry="48" strokeWidth={2} />
      <Ellipse cx="80" cy="55" rx="36" ry="48" strokeWidth={2} />
      <Line x1="32" y1="55" x2="128" y2="55" strokeWidth={2} />
      <Path strokeWidth={2} d="M36 32 Q80 44 124 32 M36 78 Q80 66 124 78" />
      <G clipPath="url(#globe)" stroke={color} strokeWidth={2.5}>
        <Path d="M42 40 C50 30 62 32 66 40 C70 48 62 56 54 56 C46 56 40 50 42 40 Z" />
        <Path d="M88 34 C98 28 110 34 112 44 C114 54 104 60 96 56 C90 52 84 44 88 34 Z" />
        <Path d="M70 70 C78 66 88 70 88 80 C88 90 80 96 74 92 C68 88 64 76 70 70 Z" />
      </G>
    </G>
  );
}

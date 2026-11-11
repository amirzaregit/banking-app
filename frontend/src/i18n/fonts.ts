import type { Lang } from './index';

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

// React Native selects font WEIGHT by family name (each weight is its own file), so we map
// (language, weight) -> family. Manrope covers Latin + Cyrillic; Vazirmatn covers Persian (and Latin).
const MANROPE: Record<Weight, string> = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
};
const VAZIRMATN: Record<Weight, string> = {
  regular: 'Vazirmatn_400Regular',
  medium: 'Vazirmatn_500Medium',
  semibold: 'Vazirmatn_600SemiBold',
  bold: 'Vazirmatn_700Bold',
  extrabold: 'Vazirmatn_800ExtraBold',
};

export const fontFamily = (lang: Lang, weight: Weight): string => (lang === 'fa' ? VAZIRMATN : MANROPE)[weight];

/** CSS/RN fontWeight ("600", "bold", ...) -> the weight we actually load. */
export function weightOf(fontWeight: string | number | undefined): Weight {
  switch (String(fontWeight ?? '400')) {
    case '500':
      return 'medium';
    case '600':
      return 'semibold';
    case '700':
    case 'bold':
      return 'bold';
    case '800':
    case '900':
      return 'extrabold';
    default:
      return 'regular';
  }
}

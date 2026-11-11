import type { Ref } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputInstance, type TextInputProps, type TextProps } from 'react-native';

import { localizeNode } from '@/i18n/digits';
import { fontFamily, weightOf } from '@/i18n/fonts';
import type { Lang } from '@/i18n';
import { useI18n } from '@/i18n/provider';

/**
 * The language-specific parts of a text style: the right font for this weight, a roomier line height and no
 * letter-spacing in Persian, and a base writing direction. Pure, so it can be tested.
 */
export function buildTextStyle(lang: Lang, style: TextProps['style']) {
  const { fontWeight, letterSpacing, ...rest } = StyleSheet.flatten(style) ?? {};
  // Persian script is taller (dots and marks above and below the line), so it needs a roomier default line height.
  const lineHeight = rest.lineHeight ?? Math.round((rest.fontSize ?? 14) * (lang === 'fa' ? 1.75 : 1.4));
  return [
    // The paragraph's base direction. Without it a number or a Latin name inside Persian text aligns by ITS
    // OWN direction (to the left) and the lines look ragged. Screens can still override it (numeric inputs do).
    { writingDirection: lang === 'fa' ? ('rtl' as const) : ('ltr' as const) },
    // NEVER force textAlign 'right' for Persian: on Android React Native maps 'right' to "opposite of the text's own
    // direction", which for Persian (already right-to-left) means the LEFT edge. Leaving it unset (natural) starts
    // Persian text at the right on every platform. A screen can still pass its own textAlign, e.g. 'center'.
    { ...rest, lineHeight },
    { fontFamily: fontFamily(lang, weightOf(fontWeight as string | undefined)) },
    // Letter-spacing breaks the joined (cursive) letters of Persian, so it is only applied elsewhere.
    lang !== 'fa' && letterSpacing != null ? { letterSpacing } : null,
  ];
}

function useTypography(style: TextProps['style'], override?: Lang) {
  const { lang: current } = useI18n();
  const lang = override ?? current;
  return { lang, style: buildTextStyle(lang, style) };
}

/** Drop-in replacement for react-native's Text: right font per language, Persian digits in Persian. */
export function Text({ style, children, lang, ...props }: TextProps & { lang?: Lang }) {
  const typography = useTypography(style, lang);
  return (
    <RNText {...props} style={typography.style}>
      {localizeNode(children, typography.lang === 'fa')}
    </RNText>
  );
}

/** Drop-in replacement for TextInput with the same font handling (Persian digits are NORMALIZED by the screens). */
export function TextInput({ style, ref, ...props }: TextInputProps & { ref?: Ref<TextInputInstance> }) {
  const typography = useTypography(style);
  return <RNTextInput ref={ref} {...props} style={typography.style} />;
}

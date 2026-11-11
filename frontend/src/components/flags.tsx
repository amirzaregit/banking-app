import { Image, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { Lang } from '@/i18n';

// The real flags (public-domain symbols, 160 px wide PNGs from flagcdn.com) bundled with the app, so they work
// offline and look identical on every phone.
//   English -> United Kingdom, Русский -> Russia, فارسی -> Iran
const FLAGS: Record<Lang, number> = {
  en: require('../../assets/flags/en.png'),
  ru: require('../../assets/flags/ru.png'),
  fa: require('../../assets/flags/fa.png'),
};

/** A flag cropped to a circle with a thin border. */
export function Flag({ lang, size = 24 }: { lang: Lang; size?: number }) {
  const theme = useTheme();
  return (
    // Decorative: the language name next to it is what screen readers should read.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
      <Image source={FLAGS[lang]} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

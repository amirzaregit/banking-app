import { isRtl, type Lang } from './index';

export type LayoutDirection = 'ltr' | 'rtl';

/**
 * The app decides its OWN layout direction in JavaScript (a `direction` style at the root plus
 * Expo Router's LocaleProvider). It deliberately does NOT use the phone's native RTL switch
 * (I18nManager.forceRTL): that only changes when the app process restarts, which made a language
 * change need a restart (and caused a reload loop). A JS-level direction applies instantly.
 */
export const layoutDirection = (lang: Lang): LayoutDirection => (isRtl(lang) ? 'rtl' : 'ltr');

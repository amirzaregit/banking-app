import * as Localization from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nManager, Platform } from 'react-native';

import { setApiLanguage } from '@/api/client';
import { kv } from '@/security/secure-kv';

import { isolateAuto } from '@/lib/money';

import { layoutDirection, type LayoutDirection } from './direction';
import { detectLanguage, isLang, isRtl, translate, type Lang, type MessageKey, type Params } from './index';

const STORAGE_KEY = 'app_language';

/** Saved choice, else the phone's own language, else English. */
async function initialLanguage(): Promise<Lang> {
  try {
    const stored = await kv.get(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // storage unavailable: fall through to the device language
  }
  return detectLanguage(Localization.getLocales().map((l) => l.languageTag));
}

/**
 * Web: tell the browser the page direction. Phones: the app applies the direction itself (see direction.ts),
 * so the platform's own RTL switch is turned OFF: it only changes on an app restart and would fight us.
 */
function applyPlatformDirection(lang: Lang) {
  const rtl = isRtl(lang);
  if (Platform.OS === 'web') {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    I18nManager.forceRTL(rtl);
    return;
  }
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
}

type I18nValue = {
  lang: Lang;
  rtl: boolean;
  direction: LayoutDirection;
  t: (key: MessageKey | (string & {}), params?: Params) => string;
  /** Applies instantly: language, fonts, direction. No reload, no restart. */
  setLanguage: (next: Lang) => Promise<void>;
};

const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang | null>(null);

  useEffect(() => {
    let active = true;
    initialLanguage().then((initial) => {
      if (!active) return;
      applyPlatformDirection(initial);
      setApiLanguage(initial);
      setLang(initial);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (next: Lang) => {
    try {
      await kv.set(STORAGE_KEY, next);
    } catch {
      // not persisted this time; the choice still applies until the app closes
    }
    applyPlatformDirection(next);
    setApiLanguage(next);
    setLang(next);
  }, []);

  const value = useMemo<I18nValue | null>(() => {
    if (lang === null) return null;
    const rtl = isRtl(lang);
    // In right-to-left sentences, wrap every text parameter (names, merchants, devices...) in a bidi isolate
    // so its punctuation and direction cannot be scrambled by the surrounding sentence.
    const isolate = (params?: Params): Params | undefined =>
      rtl && params ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' && v !== '' ? isolateAuto(v) : v])) : params;
    return { lang, rtl, direction: layoutDirection(lang), t: (key, params) => translate(lang, key, isolate(params)), setLanguage };
  }, [lang, setLanguage]);

  if (value === null) return null; // the splash screen stays up until the language is known
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

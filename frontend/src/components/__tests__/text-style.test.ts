import { StyleSheet } from 'react-native';

import { buildTextStyle } from '../text';

const flat = (lang: 'en' | 'ru' | 'fa', style?: object) => StyleSheet.flatten(buildTextStyle(lang, style)) as Record<string, unknown>;

describe('buildTextStyle', () => {
  it('never forces a physical alignment on Persian (on Android "right" would put it on the LEFT)', () => {
    expect(flat('fa', { fontSize: 16 }).textAlign).toBeUndefined();
    expect(flat('fa').textAlign).toBeUndefined();
  });

  it('still honours an alignment a screen asks for', () => {
    expect(flat('fa', { textAlign: 'center' }).textAlign).toBe('center');
  });

  it('gives Persian its own font, a taller line, a right-to-left base and no letter-spacing', () => {
    const fa = flat('fa', { fontSize: 20, fontWeight: '700', letterSpacing: 2 });
    expect(fa).toMatchObject({ fontFamily: 'Vazirmatn_700Bold', writingDirection: 'rtl', lineHeight: 35 });
    expect(fa.letterSpacing).toBeUndefined();
  });

  it('keeps letter-spacing for English and Russian', () => {
    expect(flat('en', { letterSpacing: 2 })).toMatchObject({ fontFamily: 'Manrope_400Regular', writingDirection: 'ltr', letterSpacing: 2 });
    expect(flat('ru', { fontWeight: '600' }).fontFamily).toBe('Manrope_600SemiBold');
  });

  it('does not override a line height the screen chose', () => {
    expect(flat('fa', { fontSize: 20, lineHeight: 24 }).lineHeight).toBe(24);
  });
});

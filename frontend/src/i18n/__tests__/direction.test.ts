import { layoutDirection } from '../direction';

describe('layoutDirection', () => {
  it('only Persian is right-to-left, and it is decided by language alone (never by the phone)', () => {
    expect(layoutDirection('en')).toBe('ltr');
    expect(layoutDirection('ru')).toBe('ltr');
    expect(layoutDirection('fa')).toBe('rtl');
  });
});

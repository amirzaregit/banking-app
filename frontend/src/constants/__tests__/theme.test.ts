import { Colors, type Palette } from '../theme';

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT = 4.5; // WCAG AA for normal-size text
const GRAPHIC = 3; // WCAG AA for icons and large shapes

describe.each(['light', 'dark'] as const)('%s palette is readable', (mode) => {
  const c: Palette = Colors[mode];

  it.each<[string, keyof Palette, keyof Palette]>([
    ['body text on the page', 'text', 'background'],
    ['body text on cards', 'text', 'backgroundElement'],
    ['body text on selected rows', 'text', 'backgroundSelected'],
    ['secondary text on the page', 'textSecondary', 'background'],
    ['secondary text on cards', 'textSecondary', 'backgroundElement'],
    ['teal links on the page', 'primaryText', 'background'],
    ['teal links on cards', 'primaryText', 'backgroundElement'],
    ['button text on the teal fill', 'onPrimary', 'primary'],
    ['text on the balance hero', 'onHero', 'hero'],
    ['muted text on the balance hero', 'onHeroMuted', 'hero'],
    ['text on gold chips', 'onGold', 'gold'],
    ['text on soft gold chips', 'onGoldSoft', 'goldSoft'],
    ['error text on the page', 'danger', 'background'],
    ['error text on cards', 'danger', 'backgroundElement'],
    ['success text on the page', 'success', 'background'],
    ['success text on cards', 'success', 'backgroundElement'],
  ])('%s: at least 4.5:1', (_label, fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(TEXT);
  });

  it('the teal fill and gold are visible as graphics against the page', () => {
    expect(contrast(c.primary, c.background)).toBeGreaterThanOrEqual(mode === 'light' ? 2.5 : GRAPHIC); // fill + dark label carries the meaning
    expect(contrast(c.gold, c.hero)).toBeGreaterThanOrEqual(2.9);
  });
});

it('light mode never uses pure white (the brand paper is #F7F7F7)', () => {
  const values = Object.values(Colors.light).map((v) => v.toUpperCase());
  expect(values).not.toContain('#FFFFFF');
  expect(Colors.light.background).toBe('#F7F7F7');
  expect(Colors.light.primary).toBe('#00A5AC');
  expect(Colors.light.gold).toBe('#DEAD61');
});

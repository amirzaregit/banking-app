import { fitFontSize } from '../fit-text';

describe('fitFontSize', () => {
  it('short amounts keep the maximum size', () => expect(fitFontSize('$87.00', 300, 36)).toBe(36));
  it('longer amounts get smaller, never below the minimum', () => {
    const a = fitFontSize('$1,234,567,890.00', 300, 36);
    const b = fitFontSize('IRR 1,800,000,000,000', 300, 36);
    expect(a).toBeLessThan(36);
    expect(b).toBeLessThan(a);
    expect(fitFontSize('IRR 1,800,000,000,000', 40, 36, 14)).toBe(14);
  });
  it('the result always fits the estimate', () => {
    for (const text of ['IRR 1,800,000,000,000', '₽80,000,000.00', '-$1,000,000.00']) {
      const size = fitFontSize(text, 280, 40, 8);
      expect(text.length * size * 0.6).toBeLessThanOrEqual(280);
    }
  });
  it('ignores invisible direction marks', () => expect(fitFontSize('⁦$87.00⁩', 300, 36)).toBe(fitFontSize('$87.00', 300, 36)));
  it('before the width is known it uses the maximum', () => expect(fitFontSize('IRR 1,800,000,000,000', 0, 30)).toBe(30));
});

/** Invisible bidi marks and spaces add no width: ignore them when measuring a formatted amount. */
const INVISIBLE = /[‎‏⁦-⁩‪-‮]/g;

/** Average glyph width as a fraction of the font size for bold digits, commas and a currency symbol. */
const GLYPH_WIDTH = 0.6;

/**
 * The biggest font size (between `min` and `max`) at which `text` fits on ONE line of `width` pixels.
 * A rough estimate on purpose (real text layout is not available without drawing it), so it errs on the safe side.
 *   "$87.00" in 300px -> the maximum   "IRR 1,800,000,000,000" in 300px -> smaller
 */
export function fitFontSize(text: string, width: number, max: number, min = 12): number {
  const length = text.replace(INVISIBLE, '').length;
  if (length === 0 || width <= 0) return max;
  const size = Math.floor(width / (length * GLYPH_WIDTH));
  return Math.max(min, Math.min(max, size));
}

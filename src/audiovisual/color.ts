import type { Rgb } from "./types.ts";

/**
 * Parses a 6-digit CSS hex colour ("#ff3b30") into an Rgb of three floats
 * in 0..1. Throws on anything else — a FireworkSpec's colours are trusted
 * to be well-formed, so a malformed string means something upstream is
 * broken, not a case to render around.
 */
export function parseHexColor(hex: string): Rgb {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`invalid hex color: "${hex}"`);
  }
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

/**
 * The colour's position on the hue wheel, 0..360 — 0 is red, 120 is
 * green, 240 is blue, and 360 loops back to red. Returns 0, not `NaN`,
 * for a grey: hue is meaningless when `r`, `g` and `b` coincide, and this
 * formula's usual `(component difference) / (max - min)` would otherwise
 * divide by zero.
 *
 * A caller comparing two hues must measure the short way round the wheel
 * — see `sparkGlyph` in adapters/emojiGrid.ts — because this function
 * itself does not: 359 and 1 are two degrees apart on the wheel, but this
 * returns them as the plain numbers they are.
 */
export function hueOf(color: Rgb): number {
  const { r, g, b } = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }

  let hue: number;
  if (max === r) {
    hue = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    hue = 60 * ((b - r) / delta + 2);
  } else {
    hue = 60 * ((r - g) / delta + 4);
  }
  return hue < 0 ? hue + 360 : hue;
}

/**
 * How far the colour sits from grey, 0..1 — 0 is grey, 1 is fully
 * saturated. Used to decide whether a sprite's hue means anything at all;
 * see `sparkGlyph`'s `saturationFloor`.
 */
export function saturationOf(color: Rgb): number {
  const { r, g, b } = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * The angular distance between two hues, measured the short way round the
 * wheel — so hue 350 and hue 10 are 20 degrees apart, not 340. Without
 * this, a nearest-hue search would treat deep red as the colour furthest
 * from pure red instead of a near neighbour.
 */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Picks the entry in `entries` whose `hue` is nearest `hue`, the short way
 * round the wheel. Shared by every adapter that maps a colour onto a fixed
 * table of hue-keyed choices — the emoji renderer's glyphs, the pixel
 * renderer's palette indices — so the wraparound rule lives in one place
 * rather than once per adapter. Searched exhaustively rather than sorted
 * and binary-searched: each table has at most a handful of entries, and
 * this runs once per spark per frame, not per pixel.
 */
export function nearestHue<T extends { readonly hue: number }>(
  hue: number,
  entries: readonly T[],
): T {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const entry of entries) {
    const distance = hueDistance(hue, entry.hue);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  if (best === null) {
    throw new Error("nearestHue: entries must not be empty");
  }
  return best;
}

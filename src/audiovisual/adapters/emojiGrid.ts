import { hueOf, saturationOf } from "../color.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Rgb } from "../types.ts";

// The emoji half of the frame renderer: turning a sprite's colour and
// brightness into one glyph. Grown one cycle at a time — see
// docs/07_emoji_renderer.md.

/**
 * The angular distance between two hues, measured the short way round the
 * wheel — so hue 350 and hue 10 are 20 degrees apart, not 340. Without
 * this, the nearest-hue search in `sparkGlyph` would treat deep red as
 * the colour furthest from pure red instead of a near neighbour.
 */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Picks the coloured glyph nearest `color`'s hue, or `emoji.desaturated`
 * when the colour is too close to grey for hue to mean anything.
 * `emoji.sparkHues` is searched exhaustively rather than sorted and
 * binary-searched — it has at most a handful of entries, and this
 * function runs once per spark per frame, not per pixel.
 */
export function sparkGlyph(
  color: Rgb,
  emoji: AudioVisualConfig["emoji"],
): string {
  if (saturationOf(color) < emoji.saturationFloor) {
    return emoji.desaturated;
  }

  const hue = hueOf(color);
  let best: { readonly hue: number; readonly glyph: string } | null = null;
  let bestDistance = Infinity;
  for (const entry of emoji.sparkHues) {
    const distance = hueDistance(hue, entry.hue);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  if (best === null) {
    // emoji.sparkHues is contractually non-empty — defaultAudioVisualConfig
    // fills it, and every test fixture in this file does too.
    // noUncheckedIndexedAccess-style reasoning: the compiler can't see
    // that a non-empty array was iterated, so this guards it explicitly.
    throw new Error("AudioVisualConfig.emoji.sparkHues must not be empty");
  }
  return best.glyph;
}

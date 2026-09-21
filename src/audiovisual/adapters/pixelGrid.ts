import { hueOf, nearestHue, saturationOf } from "../color.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Rgb } from "../types.ts";

// The pixel half of the frame renderer: turning a sprite's colour,
// position and radius into palette indices on a fixed-size grid. Grown
// one cycle at a time — see docs/09_8bit_renderer.md. This is the emoji
// renderer with a palette index where the glyph was: `sparkIndex` is
// `sparkGlyph`'s exact structure, over `pixel` instead of `emoji`.

/**
 * Picks the palette index nearest `color`'s hue, or `pixel.desaturated`
 * when the colour is too close to grey for hue to mean anything. The
 * nearest-hue search itself, wraparound included, lives in `nearestHue` —
 * shared with the emoji renderer's glyph lookup.
 */
export function sparkIndex(
  color: Rgb,
  pixel: AudioVisualConfig["pixel"],
): number {
  if (saturationOf(color) < pixel.saturationFloor) {
    return pixel.desaturated;
  }
  return nearestHue(hueOf(color), pixel.sparkHues).index;
}

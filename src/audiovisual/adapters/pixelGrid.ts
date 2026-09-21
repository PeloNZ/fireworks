import { rampLevel } from "./ramp.ts";
import { hueOf, nearestHue, saturationOf } from "../color.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Rgb, Sprite } from "../types.ts";

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

/**
 * Picks one sprite's palette index. A shell is one thing throughout its
 * flight, so its colour never enters the decision. A spark's colour is
 * the fact ASCII discards — `sparkIndex` reads it. A trail fades, and a
 * palette index cannot dim itself, so a trail's index comes from
 * brightness through its own short ramp, via `rampLevel` — its colour is
 * never read either. Mirrors `glyphFor` in emojiGrid.ts exactly.
 */
export function indexFor(
  sprite: Sprite,
  pixel: AudioVisualConfig["pixel"],
): number {
  switch (sprite.kind) {
    case "shell":
      return pixel.shell;
    case "spark":
      return sparkIndex(sprite.color, pixel);
    case "trail":
      return rampLevel(sprite.brightness, pixel.trail);
  }
}

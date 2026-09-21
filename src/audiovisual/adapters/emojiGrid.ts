import { contestCells } from "./cells.ts";
import { rampLevel } from "./ramp.ts";
import { hueOf, nearestHue, saturationOf } from "../color.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Frame, Rgb, Sprite } from "../types.ts";

// The emoji half of the frame renderer: turning a sprite's colour and
// brightness into one glyph. Grown one cycle at a time — see
// docs/07_emoji_renderer.md.

/**
 * Picks the coloured glyph nearest `color`'s hue, or `emoji.desaturated`
 * when the colour is too close to grey for hue to mean anything. The
 * nearest-hue search itself, wraparound included, lives in `nearestHue` —
 * shared with the pixel renderer's palette lookup.
 */
export function sparkGlyph(
  color: Rgb,
  emoji: AudioVisualConfig["emoji"],
): string {
  if (saturationOf(color) < emoji.saturationFloor) {
    return emoji.desaturated;
  }
  return nearestHue(hueOf(color), emoji.sparkHues).glyph;
}

/**
 * Maps a brightness in 0..1 onto one glyph in `glyphs`, dimmest first —
 * the emoji counterpart of `rampChar`, over an array of glyphs instead of
 * a string of characters, since a glyph can be more than one UTF-16 code
 * unit and a string index would read half of it. The lookup itself is
 * `rampLevel`, shared with the pixel renderer's brightness ramps.
 */
export function rampGlyph(
  brightness: number,
  glyphs: readonly string[],
): string {
  return rampLevel(brightness, glyphs);
}

/**
 * Picks one sprite's glyph. A shell is one thing throughout its flight,
 * so its colour never enters the decision. A spark's colour is the fact
 * ASCII discards — `sparkGlyph` reads it. A trail fades, and an emoji
 * cannot dim, so a trail's glyph comes from brightness through its own
 * short ramp, the same way `rampChar` already does for the ASCII trail —
 * its colour is never read either.
 */
export function glyphFor(
  sprite: Sprite,
  emoji: AudioVisualConfig["emoji"],
): string {
  switch (sprite.kind) {
    case "shell":
      return emoji.shell;
    case "spark":
      return sparkGlyph(sprite.color, emoji);
    case "trail":
      return rampGlyph(sprite.brightness, emoji.trail);
  }
}

/**
 * Renders a frame's display list to a grid of glyphs — `emoji.rows` rows
 * of `emoji.columns` cell strings, an array of arrays rather than one
 * joined string, since an emoji is more than one UTF-16 code unit and
 * joining early would make every later cell-by-cell operation (the
 * backdrop composite, cycle 6) index into the wrong place.
 *
 * Which sprite wins each cell is `contestCells`'s job, shared with the
 * ASCII adapter. This function only decides what glyph the winner
 * becomes, and fills every other cell with `emoji.blank`.
 */
export function rasteriseEmojiFrame(
  frame: Frame,
  emoji: AudioVisualConfig["emoji"],
): readonly string[][] {
  const cells = contestCells(frame, emoji);
  return cells.map((row) =>
    row.map((sprite) => (sprite ? glyphFor(sprite, emoji) : emoji.blank)),
  );
}

/**
 * Composites a finished foreground grid over a finished base grid — the
 * emoji counterpart of `overlayGrid`, operating on `readonly string[][]`
 * instead of indexing a joined string, for the same UTF-16 reason every
 * other emoji function in this file does.
 *
 * One rule, unchanged from `overlayGrid`: **the foreground shows through
 * unless it is blank.** `base` must already fill every cell — a correctly
 * built backdrop always does (see `rasteriseEmojiBackdrop`), so there is
 * no fallback here for a missing base cell.
 */
export function overlayEmojiGrid(
  base: readonly string[][],
  over: readonly string[][],
  blank: string,
): readonly string[][] {
  return over.map((row, rowIndex) =>
    row.map((glyph, columnIndex) => {
      if (glyph !== blank) {
        return glyph;
      }
      const baseRow = base[rowIndex];
      const baseGlyph = baseRow?.[columnIndex];
      return baseGlyph ?? blank;
    }),
  );
}

import { contestCells } from "./cells.ts";
import { hueOf, saturationOf } from "../color.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Frame, Rgb, Sprite } from "../types.ts";

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

/**
 * Maps a brightness in 0..1 onto one glyph in `glyphs`, dimmest first —
 * the emoji counterpart of `rampChar`, over an array of glyphs instead of
 * a string of characters, since a glyph can be more than one UTF-16 code
 * unit and a string index would read half of it.
 */
export function rampGlyph(
  brightness: number,
  glyphs: readonly string[],
): string {
  const clamped = Math.min(1, Math.max(0, brightness));
  const index = Math.round(clamped * (glyphs.length - 1));
  const glyph = glyphs[index];
  if (glyph === undefined) {
    // index is always within [0, glyphs.length - 1] for a clamped
    // brightness and a non-empty list. noUncheckedIndexedAccess can't see
    // that, so it types this access as possibly undefined regardless.
    throw new Error("unreachable: glyph index out of range");
  }
  return glyph;
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

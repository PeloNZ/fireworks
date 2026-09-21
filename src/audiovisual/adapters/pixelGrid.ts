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

/**
 * How far world `x` reaches left and right of centre for this grid's
 * shape. `toCell`'s grid is fixed at world `x ∈ [-50, 50)`, but the pixel
 * grid fills whatever viewport it is given, so its width is derived from
 * `columns`/`rows` instead: one pixel is always `100 / rows` world units
 * tall (world `y ∈ [0, 100)` maps across every row), and forcing pixels
 * square makes the same true of width, so the visible half-width is
 * `50 * columns / rows`. A square grid (`columns === rows`) reproduces
 * `toCell`'s own ±50 box exactly.
 */
export function worldHalfWidth(grid: {
  readonly columns: number;
  readonly rows: number;
}): number {
  return (50 * grid.columns) / grid.rows;
}

/**
 * The world `x` at the horizontal centre of `column` — the pixel-grid
 * counterpart of `columnCentreX`, using `worldHalfWidth` instead of a
 * fixed ±50.
 */
export function pixelCentreX(
  column: number,
  grid: { readonly columns: number; readonly rows: number },
): number {
  const halfWidth = worldHalfWidth(grid);
  return -halfWidth + ((2 * halfWidth) / grid.columns) * (column + 0.5);
}

/**
 * Maps a world point onto a flat row-major pixel offset
 * (`row * columns + column`), flipping `y` — world `y` grows up, pixel
 * rows grow down, the same rule `toCell` uses. Returns `null` when the
 * point falls outside the grid, which is what clips a sprite rather than
 * wrapping it to the opposite edge.
 *
 * The box is half-open on every side, exactly as `toCell`'s is, but its
 * width comes from `worldHalfWidth` instead of a fixed ±50 — the pixel
 * grid fills whatever viewport it is given. The `y` mapping is unchanged
 * from `toCell`, since world `y ∈ [0, 100)` never varies with the grid's
 * shape.
 */
export function toPixel(
  x: number,
  y: number,
  grid: { readonly columns: number; readonly rows: number },
): number | null {
  const { columns, rows } = grid;
  const halfWidth = worldHalfWidth(grid);
  const column = Math.floor(((x + halfWidth) / (2 * halfWidth)) * columns);
  const row = rows - 1 - Math.floor((y / 100) * rows);
  if (column < 0 || column >= columns || row < 0 || row >= rows) {
    return null;
  }
  return row * columns + column;
}

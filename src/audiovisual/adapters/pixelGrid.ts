import { rampLevel } from "./ramp.ts";
import { hueOf, nearestHue, saturationOf } from "../color.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Frame, Mover, Rgb, Sprite } from "../types.ts";

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
 * The column a world `x` falls in — unclamped, so it can land outside
 * `[0, columns)` for a point beyond the grid. `toPixel` clamps this to
 * `null`; `discCells` uses the raw index to bound its scan.
 */
function columnIndexFor(
  x: number,
  grid: { readonly columns: number; readonly rows: number },
): number {
  const halfWidth = worldHalfWidth(grid);
  return Math.floor(((x + halfWidth) / (2 * halfWidth)) * grid.columns);
}

/**
 * The row a world `y` falls in — unclamped, flipping `y` the same way
 * `toCell` does. See `columnIndexFor`.
 */
function rowIndexFor(
  y: number,
  grid: { readonly columns: number; readonly rows: number },
): number {
  return grid.rows - 1 - Math.floor((y / 100) * grid.rows);
}

/**
 * The world `y` at the vertical centre of `row` — the pixel-grid
 * counterpart of `rowCentreY`, over `grid.rows` alone, since the `y`
 * mapping never varies with the grid's width. Exported for
 * `pixelBackdrop.ts`, which samples the sky once per row.
 */
export function pixelCentreY(
  row: number,
  grid: { readonly columns: number; readonly rows: number },
): number {
  return (100 * (grid.rows - row - 0.5)) / grid.rows;
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
  const column = columnIndexFor(x, grid);
  const row = rowIndexFor(y, grid);
  if (column < 0 || column >= columns || row < 0 || row >= rows) {
    return null;
  }
  return row * columns + column;
}

/**
 * Every pixel offset whose centre lies within `radius` world units of
 * `centre` — the disc a sprite's own radius actually covers, honouring
 * `Sprite.size` in a way neither the ASCII nor the emoji renderer can.
 * `contestCells` cannot answer this: it decides one sprite per cell,
 * before any shape exists, and two discs can overlap on some pixels and
 * not others.
 *
 * The column/row range scanned is bounded by `centre ± radius`, padded by
 * one pixel each side and clamped to the grid — a performance bound, not
 * a correctness one. Every pixel actually included is still decided by
 * the distance test below; a too-wide bound only scans a few pixels that
 * were always going to fail it.
 */
export function discCells(
  centre: { readonly x: number; readonly y: number },
  radius: number,
  grid: { readonly columns: number; readonly rows: number },
): readonly number[] {
  const { columns, rows } = grid;
  const minColumn = Math.max(0, columnIndexFor(centre.x - radius, grid) - 1);
  const maxColumn = Math.min(
    columns - 1,
    columnIndexFor(centre.x + radius, grid) + 1,
  );
  const minRow = Math.max(0, rowIndexFor(centre.y + radius, grid) - 1);
  const maxRow = Math.min(rows - 1, rowIndexFor(centre.y - radius, grid) + 1);

  const offsets: number[] = [];
  for (let row = minRow; row <= maxRow; row++) {
    const dy = pixelCentreY(row, grid) - centre.y;
    for (let column = minColumn; column <= maxColumn; column++) {
      const dx = pixelCentreX(column, grid) - centre.x;
      if (dx * dx + dy * dy <= radius * radius) {
        offsets.push(row * columns + column);
      }
    }
  }

  if (offsets.length === 0) {
    // A radius smaller than the spacing between pixel centres covers no
    // centre at all -- true of every spark at this renderer's resolution
    // -- so the pixel the centre itself falls in is painted instead. A
    // centre outside the grid stays invisible rather than smearing onto
    // the border: toPixel returns null there, same as everywhere else.
    const centrePixel = toPixel(centre.x, centre.y, grid);
    if (centrePixel !== null) {
      offsets.push(centrePixel);
    }
  }

  return offsets;
}

/**
 * Paints the ambient movers into a buffer of their own, `blank` where no mover
 * sits. A mover is a head and a tail. The head is one pixel at `toPixel`. The
 * tail runs behind it, against the velocity, for `speed * moverTailMs[kind]`
 * world units, with one sample for each pixel step (`100 / rows`). Brightness
 * falls in a straight line from the head's to 0 at the far end. Each sample
 * takes its index from `pixel.moverRamp` through `rampLevel`. The far samples
 * paint first and the head last, so the head wins a pixel its own tail shares.
 * A mover outside the grid paints nothing. A later mover wins a shared pixel,
 * and `blank` is never written, so a mover too dim to show leaves the one
 * before it. See docs/11_ambient_movers.md.
 */
function paintMovers(
  movers: readonly Mover[],
  pixel: AudioVisualConfig["pixel"],
): Uint8Array {
  const { columns, rows, blank } = pixel;
  const buffer = new Uint8Array(columns * rows).fill(blank);
  const step = 100 / rows;

  const paintAt = (x: number, y: number, brightness: number): void => {
    const offset = toPixel(x, y, pixel);
    const index = rampLevel(brightness, pixel.moverRamp);
    if (offset !== null && index !== blank) {
      buffer[offset] = index;
    }
  };

  for (const mover of movers) {
    const { position, velocity, brightness } = mover;
    const speed = Math.hypot(velocity.x, velocity.y);
    const length = (speed * pixel.moverTailMs[mover.kind]) / 1000;
    for (let sample = Math.floor(length / step); sample >= 1; sample--) {
      const distance = sample * step;
      paintAt(
        position.x - (velocity.x / speed) * distance,
        position.y - (velocity.y / speed) * distance,
        brightness * (1 - distance / length),
      );
    }
    paintAt(position.x, position.y, brightness);
  }

  return buffer;
}

/**
 * Renders a frame's display list to a buffer of palette indices —
 * `pixel.rows * pixel.columns` entries, `pixel.blank` where nothing
 * draws. Unlike `rasteriseFrame`/`rasteriseEmojiFrame`, which sprite wins
 * each cell is not `contestCells`'s job here: a sprite covers a disc of
 * pixels rather than one cell, and two discs can overlap on some pixels
 * and not others, so which sprite wins is decided per pixel as each disc
 * is painted.
 *
 * Brightest wins; on a tie the earlier sprite in `frame.sprites` keeps
 * it — the strict `>` below overwrites only when a later sprite is
 * actually brighter, the complement of `contestCells`'s own tie-break
 * (`existing.brightness >= sprite.brightness` skips the new sprite).
 * Reversed, a dimmer, later sprite (a decaying trail) would displace one
 * that got there first. The brightness this pixel was last painted at
 * starts below every real brightness (`-1`, never `0`): a fully decayed
 * trail has `brightness: 0` (`frame.ts`), and a buffer that started at
 * `0` would treat that as "nothing painted here" and silently drop it.
 *
 * A sprite's radius is scaled by its own brightness before it is painted.
 * `frame.ts` gives a shell's trail points `size: config.shellSize` —
 * identical to the shell itself — and this is the first renderer that
 * reads `size` at all, so without scaling, a trail is a chain of
 * full-size discs the same width as the shell it follows, and a fading
 * spark never shrinks. One multiplication does both, with no branch on
 * `kind`.
 *
 * The ambient movers paint into a second buffer, which merges under this one:
 * a firework pixel wins unless it is `blank`. The contest above runs on the
 * firework buffer alone, as it did before movers existed.
 */
export function paintFrame(
  frame: Frame,
  pixel: AudioVisualConfig["pixel"],
): Uint8Array {
  const { columns, rows, blank } = pixel;
  const buffer = new Uint8Array(columns * rows).fill(blank);
  const painted = new Float32Array(columns * rows).fill(-1);

  for (const sprite of frame.sprites) {
    const index = indexFor(sprite, pixel);
    const radius = sprite.size * sprite.brightness;
    for (const offset of discCells(sprite.position, radius, pixel)) {
      if (sprite.brightness > (painted[offset] ?? -1)) {
        painted[offset] = sprite.brightness;
        buffer[offset] = index;
      }
    }
  }

  // A firework pixel wins unless it is blank. A dead trail paints blank, and
  // the mover behind it must show through.
  const movers = paintMovers(frame.ambient, pixel);
  return buffer.map((index, offset) =>
    index !== blank ? index : (movers[offset] ?? blank),
  );
}

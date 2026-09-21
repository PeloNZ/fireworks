// The ASCII half of the world backdrop: turning a Backdrop's world-space
// facts into characters. Grown one cycle at a time — see
// docs/06_world_backdrop.md.
//
// Split from asciiGrid.ts for the same reason that file was split from
// ascii.ts: the interesting part is a pure function returning a plain
// string a test can assert in full. The two rasterisers share nothing but
// rampChar.
//
// This is also the only place in the backdrop's code allowed to name a
// character. A glyph is a rendering decision; the core decides only what
// is where and how bright it is.

import { rampChar, toCell } from "./asciiGrid.ts";
import { groundHeightAt, skyBrightnessAt } from "../backdrop.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop } from "../types.ts";

// World space is 100 units tall and 100 wide, `x` from -50, `y` growing
// up — the same extents asciiGrid.ts maps onto cells, hardcoded there too.
// Deliberately not promoted into WorldConfig: that would touch Action's
// tested physics config for no behaviour change. See
// docs/06_world_backdrop.md.
const WORLD_TOP = 100;
const WORLD_LEFT = -50;
const WORLD_WIDTH = 100;

/**
 * The world `y` at the vertical centre of `row` — the exact inverse of
 * asciiGrid.ts's `row = rows - 1 - floor((y / 100) * rows)`.
 *
 * Centres rather than edges, so the drawn sky is the true gradient rounded
 * to the nearest cell with no systematic bias up or down.
 */
function rowCentreY(row: number, rows: number): number {
  return (WORLD_TOP * (rows - row - 0.5)) / rows;
}

/**
 * The world `x` at the horizontal centre of `column` — the inverse of
 * asciiGrid.ts's `column = floor(((x + 50) / 100) * columns)`. Centres
 * again, so the drawn skyline is the true height rounded to the nearest
 * cell with no bias left or right.
 */
function columnCentreX(column: number, columns: number): number {
  return WORLD_LEFT + (WORLD_WIDTH * (column + 0.5)) / columns;
}

/**
 * Rasterises the static backdrop to one grid string, the same shape
 * `rasteriseFrame` produces: `ascii.rows` lines of `ascii.columns`
 * characters, joined with `"\n"`.
 *
 * Painted bottom to top — the sky fills every cell, then bodies draw over
 * it in their array order, then the ground over everything. There is no
 * brightness contest anywhere in here: inside the backdrop, later simply
 * wins. That is what makes a moon beat a star sharing its cell, and the
 * ground bury a body below the skyline, without any overlap test.
 *
 * Every cell is filled, so the foreground always has something to
 * composite onto. Built once, at renderer construction — nothing in a
 * backdrop changes frame to frame.
 *
 * Takes the whole config because it needs two slices of it: `ascii` for
 * the grid and its characters, `backdrop` for the ground's fill
 * brightness, which is a fixed tunable rather than anything the seed
 * decides.
 */
export function rasteriseBackdrop(
  backdrop: Backdrop,
  config: AudioVisualConfig,
): string {
  const { ascii } = config;
  const { columns, rows, ramp } = ascii;

  const cells: string[][] = [];
  for (let row = 0; row < rows; row++) {
    const brightness = skyBrightnessAt(backdrop.sky, rowCentreY(row, rows));
    cells.push(new Array<string>(columns).fill(rampChar(brightness, ramp)));
  }

  const lineAt = (row: number): string[] => {
    const line = cells[row];
    if (line === undefined) {
      // Every row index here comes from a bounded loop or from toCell,
      // which already rejected anything outside [0, rows).
      // noUncheckedIndexedAccess can't see that.
      throw new Error("unreachable: cell row outside the grid");
    }
    return line;
  };

  for (const body of backdrop.bodies) {
    const cell = toCell(body.position.x, body.position.y, ascii);
    if (cell === null) {
      continue;
    }
    lineAt(cell.row)[cell.column] = ascii.backdropGlyphs[body.kind];
  }

  // The ground last. Rows run top to bottom, so the first ground cell a
  // column meets is its topmost one — the ridge; everything under it is
  // mass. In a character grid the landform has to be drawn in ink to exist
  // at all, which is why this is a lit shape rather than a true silhouette.
  const fill = rampChar(config.backdrop.groundFillBrightness, ramp);
  for (let column = 0; column < columns; column++) {
    const height = groundHeightAt(
      backdrop.ground,
      columnCentreX(column, columns),
    );
    let ridgeDrawn = false;
    for (let row = 0; row < rows; row++) {
      if (rowCentreY(row, rows) > height) {
        continue;
      }
      lineAt(row)[column] = ridgeDrawn ? fill : ascii.backdropGlyphs.ridge;
      ridgeDrawn = true;
    }
  }

  return cells.map((line) => line.join("")).join("\n");
}

/**
 * Composites a finished foreground grid over a finished backdrop grid.
 * One rule: **the foreground shows through unless it is blank.**
 *
 * That is safe rather than a shortcut, because a foreground cell holding a
 * space is already visually nothing — a sprite too dim to draw maps to
 * `ramp[0]`, a space, and is indistinguishable from an empty cell. Letting
 * the sky show through either one changes no visible output. Getting it
 * backwards would be a real artifact: a decaying trail tail would drag a
 * moving hole across the sky, so something meant to be invisible would
 * become visible by erasing what is behind it.
 *
 * Both grids come from the same `ascii` config, so they are the same shape
 * and their newlines line up — a newline is never a space, so it is always
 * taken from the foreground and never moves.
 */
export function overlayGrid(base: string, over: string): string {
  let out = "";
  for (let i = 0; i < over.length; i++) {
    const char = over[i] ?? " ";
    out += char === " " ? (base[i] ?? " ") : char;
  }
  return out;
}

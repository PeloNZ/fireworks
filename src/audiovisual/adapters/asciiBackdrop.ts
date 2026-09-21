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
import { skyBrightnessAt } from "../backdrop.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop } from "../types.ts";

// World space is 100 units tall, `y` growing up — the same extent
// asciiGrid.ts maps onto rows, hardcoded there too. Deliberately not
// promoted into WorldConfig: that would touch Action's tested physics
// config for no behaviour change. See docs/06_world_backdrop.md.
const WORLD_TOP = 100;

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
 * Rasterises the static backdrop to one grid string, the same shape
 * `rasteriseFrame` produces: `ascii.rows` lines of `ascii.columns`
 * characters, joined with `"\n"`.
 *
 * Painted bottom to top — the sky fills every cell, then bodies draw over
 * it in their array order, later winning. There is no brightness contest
 * anywhere in here: inside the backdrop, later simply wins, which is what
 * makes a moon beat a star sharing its cell without any overlap test.
 *
 * Every cell is filled, so the foreground always has something to
 * composite onto. Built once, at renderer construction — nothing in a
 * backdrop changes frame to frame.
 */
export function rasteriseBackdrop(
  backdrop: Backdrop,
  ascii: AudioVisualConfig["ascii"],
): string {
  const { columns, rows, ramp } = ascii;

  const cells: string[][] = [];
  for (let row = 0; row < rows; row++) {
    const brightness = skyBrightnessAt(backdrop.sky, rowCentreY(row, rows));
    cells.push(new Array<string>(columns).fill(rampChar(brightness, ramp)));
  }

  for (const body of backdrop.bodies) {
    const cell = toCell(body.position.x, body.position.y, ascii);
    if (cell === null) {
      continue;
    }
    const line = cells[cell.row];
    if (line === undefined) {
      // toCell already rejected any row outside [0, rows), and the loop
      // above pushed exactly `rows` lines. noUncheckedIndexedAccess can't
      // see that.
      throw new Error("unreachable: cell row outside the grid");
    }
    line[cell.column] = ascii.backdropGlyphs[body.kind];
  }

  return cells.map((line) => line.join("")).join("\n");
}

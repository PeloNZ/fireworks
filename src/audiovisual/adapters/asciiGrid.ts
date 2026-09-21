import type { AudioVisualConfig } from "../config.ts";
import type { Frame } from "../types.ts";

/**
 * Maps a brightness in 0..1 onto one character in `ramp`, dimmest to
 * brightest.
 */
function rampChar(brightness: number, ramp: string): string {
  const clamped = Math.min(1, Math.max(0, brightness));
  const index = Math.round(clamped * (ramp.length - 1));
  const char = ramp[index];
  if (char === undefined) {
    // index is always within [0, ramp.length - 1] for a clamped brightness
    // and a non-empty ramp. noUncheckedIndexedAccess can't see that, so it
    // types this access as possibly undefined regardless.
    throw new Error("unreachable: ramp index out of range");
  }
  return char;
}

/**
 * Renders a frame's display list to one string: a fixed grid of
 * `ascii.columns` by `ascii.rows` characters, world space mapped onto it
 * with `y` flipped — world `y` grows up, grid rows grow down. A sprite
 * that falls outside the grid is clipped, never wrapped to the opposite
 * edge. When two sprites land in the same cell, the brighter one's
 * character wins.
 */
export function rasteriseFrame(
  frame: Frame,
  ascii: AudioVisualConfig["ascii"],
): string {
  const { columns, rows, ramp } = ascii;
  const cells = new Map<
    string,
    { readonly char: string; brightness: number }
  >();

  for (const sprite of frame.sprites) {
    const column = Math.floor(((sprite.position.x + 50) / 100) * columns);
    const row = rows - 1 - Math.floor((sprite.position.y / 100) * rows);
    if (column < 0 || column >= columns || row < 0 || row >= rows) {
      continue;
    }

    const key = `${row.toString()},${column.toString()}`;
    const existing = cells.get(key);
    if (existing && existing.brightness >= sprite.brightness) {
      continue;
    }
    cells.set(key, {
      char: rampChar(sprite.brightness, ramp),
      brightness: sprite.brightness,
    });
  }

  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = "";
    for (let column = 0; column < columns; column++) {
      line += cells.get(`${row.toString()},${column.toString()}`)?.char ?? " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

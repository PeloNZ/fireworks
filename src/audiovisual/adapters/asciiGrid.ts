import { contestCells, placeMovers } from "./cells.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Frame, Mover } from "../types.ts";

/**
 * Maps a brightness in 0..1 onto one character in `ramp`, dimmest to
 * brightest. Exported so the backdrop's sky and ground share this one
 * mapping rather than keeping a second copy that can drift from it —
 * see `rasteriseBackdrop` in asciiBackdrop.ts.
 */
export function rampChar(brightness: number, ramp: string): string {
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
 *
 * Which sprite wins each cell is `contestCells`'s job, shared with the
 * emoji adapter — see docs/07_emoji_renderer.md. This function only
 * decides what character the winner becomes.
 */
export function rasteriseFrame(
  frame: Frame,
  ascii: AudioVisualConfig["ascii"],
): string {
  const { ramp } = ascii;
  const cells = contestCells(frame, ascii);

  return cells
    .map((row) =>
      row
        .map((sprite) => (sprite ? rampChar(sprite.brightness, ramp) : " "))
        .join(""),
    )
    .join("\n");
}

/**
 * Renders the ambient movers to one string the same size as
 * `rasteriseFrame`'s grid: each mover is the ramp character for its
 * brightness, and every other cell is a space. A mover outside the grid
 * draws nothing. It is a separate pass from `rasteriseFrame` so the
 * renderer can layer it between the backdrop and the fireworks — see
 * docs/11_ambient_movers.md.
 */
export function rasteriseAmbient(
  movers: readonly Mover[],
  ascii: AudioVisualConfig["ascii"],
): string {
  const { ramp } = ascii;

  return placeMovers(movers, ascii)
    .map((row) =>
      row
        .map((mover) => (mover ? rampChar(mover.brightness, ramp) : " "))
        .join(""),
    )
    .join("\n");
}

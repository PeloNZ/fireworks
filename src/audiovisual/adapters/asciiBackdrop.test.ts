import { describe, expect, it } from "vitest";
import { rasteriseBackdrop } from "./asciiBackdrop.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Backdrop } from "../types.ts";

// Cycle 8 (docs/06_world_backdrop.md): the sky gradient onto rows. Unlike
// rasteriseFrame, this walks cells and asks the core what the world looks
// like at each cell's centre — a backdrop has to cover the whole
// rectangle, including the top row, which a sprite at y = 100 cannot reach
// because the render box is half-open there.
//
// A five-character ramp with no space in it, so a cell that accidentally
// drew nothing shows up as a failure instead of passing as a space. Three
// columns by two rows keeps every cell hand-checkable, and the row centres
// (y = 75 and y = 25) avoid any .5 rounding tie, so these assertions do not
// quietly depend on how Math.round breaks them.
const ascii = {
  ...defaultAudioVisualConfig.ascii,
  columns: 3,
  rows: 2,
  ramp: "abcde",
};

// Ground flat at height 0 draws nothing, since no row's centre is at or
// below it — which keeps this fixture green unedited through cycles 9 and
// 10, when bodies and ground start drawing.
function backdrop(overrides: Partial<Backdrop> = {}): Backdrop {
  return {
    sky: { horizon: 1, zenith: 0 },
    bodies: [],
    ground: [
      { x: -50, height: 0 },
      { x: 50, height: 0 },
    ],
    ...overrides,
  };
}

describe("rasteriseBackdrop", () => {
  it("draws the sky gradient brighter at the bottom, sampled at each row's centre", () => {
    // horizon 1 and zenith 0 is deliberately past the config cap — capping
    // is buildSky's job, in the core, not the adapter's.
    // Row 0's centre is y = 75, so brightness 0.25 -> ramp index 1 -> "b".
    // Row 1's centre is y = 25, so brightness 0.75 -> ramp index 3 -> "d".
    expect(rasteriseBackdrop(backdrop(), ascii)).toBe(
      ["bbb", "ddd"].join("\n"),
    );
  });

  it("fills every cell of the grid, so a firework never composites onto a hole", () => {
    const grid = rasteriseBackdrop(backdrop(), ascii);
    const lines = grid.split("\n");

    expect(lines).toHaveLength(ascii.rows);
    for (const line of lines) {
      expect(line).toHaveLength(ascii.columns);
    }
  });
});

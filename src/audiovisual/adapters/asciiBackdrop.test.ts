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
// Unusual glyphs too, so the real defaults ("*", "O", "o", "^") cannot
// pass by accident.
const ascii = {
  ...defaultAudioVisualConfig.ascii,
  columns: 3,
  rows: 2,
  ramp: "abcde",
  backdropGlyphs: { star: "S", moon: "M", planet: "P", ridge: "R" },
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

  // Cycle 9: bodies over the sky, each as its own fixed glyph. Positions
  // map to cells through exactly the mapping rasteriseFrame uses, so a
  // moon and a spark at one world point land in one cell.

  it("draws each body as its kind's glyph, with later bodies over earlier ones", () => {
    const withBodies = backdrop({
      bodies: [
        // Row 0, column 0 — and the moon below takes the same cell.
        { kind: "star", position: { x: -40, y: 75, z: 0 } },
        { kind: "star", position: { x: -40, y: 25, z: 0 } }, // row 1, column 0
        { kind: "planet", position: { x: 30, y: 25, z: 0 } }, // row 1, column 2
        // Last, so it wins the cell the first star wanted. Paint order is
        // the whole mechanism — there is no overlap test anywhere.
        { kind: "moon", position: { x: -40, y: 75, z: 0 } },
      ],
    });

    expect(rasteriseBackdrop(withBodies, ascii)).toBe(
      ["Mbb", "SdP"].join("\n"),
    );
  });

  it("clips a body outside the world box instead of wrapping it to the opposite edge", () => {
    const offScreen = backdrop({
      bodies: [{ kind: "moon", position: { x: 1000, y: 50, z: 0 } }],
    });

    expect(rasteriseBackdrop(offScreen, ascii)).toBe(["bbb", "ddd"].join("\n"));
  });
});

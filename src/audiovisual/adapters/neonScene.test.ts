import { describe, expect, it } from "vitest";
import { toCanvas } from "./neonScene.ts";

// Cycle 3 (docs/12_neon_renderer.md): world space to canvas pixels. The
// canvas is not square, so the world is 100 units tall and `50 * width /
// height` units either side of the middle, the same widening the pixel
// renderer uses. A 300x120 canvas gives 125 units either side and 1.2
// pixels per world unit.

const canvas = { width: 300, height: 120 };

describe("toCanvas", () => {
  it("puts the top-left of the world at pixel (0, 0)", () => {
    expect(toCanvas({ x: -125, y: 100 }, canvas)).toEqual({ x: 0, y: 0 });
  });

  it("puts the bottom-right of the world at the canvas size", () => {
    expect(toCanvas({ x: 125, y: 0 }, canvas)).toEqual({ x: 300, y: 120 });
  });

  it("puts the middle of the world at the middle of the canvas", () => {
    expect(toCanvas({ x: 0, y: 50 }, canvas)).toEqual({ x: 150, y: 60 });
  });
});

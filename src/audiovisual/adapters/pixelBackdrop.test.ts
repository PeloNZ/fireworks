import { describe, expect, it } from "vitest";
import { paintBackdrop } from "./pixelBackdrop.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop } from "../types.ts";

// Cycle 13 (docs/09_8bit_renderer.md): the background plane's sky, one
// row at a time -- painted once per page load, outside the per-frame
// loop. An uncapped sky and a 3x2 grid whose two row centres (y=75,
// y=25) give brightness 0.25 and 0.75 against a five-entry ramp --
// round(0.25*4)=1, round(0.75*4)=3, no rounding tie.

const pixel: AudioVisualConfig["pixel"] = {
  ...defaultAudioVisualConfig.pixel,
  columns: 3,
  rows: 2,
  sky: [90, 91, 92, 93, 94],
};

describe("paintBackdrop -- the sky", () => {
  it("fills every pixel from the sky gradient alone, ramped per row", () => {
    const backdrop: Backdrop = {
      sky: { horizon: 1, zenith: 0 }, // uncapped: capping is buildSky's job
      bodies: [],
      // Flat and low enough that no row centre in this 2-row grid (75,
      // 25) reaches it -- this cycle paints sky only, ground arrives in
      // cycle 15.
      ground: [
        { x: -50, height: 0 },
        { x: 50, height: 0 },
      ],
    };

    const buffer = paintBackdrop(backdrop, pixel);

    expect(Array.from(buffer)).toEqual([91, 91, 91, 93, 93, 93]);
  });
});

// Cycle 14: bodies painted as discs, in array order -- later entries win
// an overlap, the same rule the ASCII and emoji backdrops use, with no
// brightness contest inside a backdrop (CelestialBody has no brightness
// field at all). wideGrid and radius 20 reuse discCells's own cycle-7
// fixture exactly, so the expected offsets are already known-correct.
const wideGrid = { columns: 10, rows: 8 };
const flatGround: Backdrop["ground"] = [
  { x: -50, height: -100 },
  { x: 50, height: -100 },
];

describe("paintBackdrop -- bodies", () => {
  const bodyPixel: AudioVisualConfig["pixel"] = {
    ...defaultAudioVisualConfig.pixel,
    columns: wideGrid.columns,
    rows: wideGrid.rows,
    sky: [5, 5, 5, 5, 5], // flat, so body cells are easy to tell apart
    bodies: {
      star: { index: 99, radius: 20 },
      moon: { index: 42, radius: 20 },
      planet: { index: 0, radius: 0 },
    },
  };
  const moonOffsets = [24, 25, 33, 34, 35, 36, 43, 44, 45, 46, 54, 55];

  it("paints a moon as the same disc discCells computes", () => {
    const backdrop: Backdrop = {
      sky: { horizon: 0.5, zenith: 0.5 },
      bodies: [{ kind: "moon", position: { x: 0, y: 50, z: 0 } }],
      ground: flatGround,
    };

    const buffer = paintBackdrop(backdrop, bodyPixel);

    for (const offset of moonOffsets) {
      expect(buffer[offset]).toBe(42);
    }
  });

  it("lets a later body win an exact overlap", () => {
    const backdrop: Backdrop = {
      sky: { horizon: 0.5, zenith: 0.5 },
      bodies: [
        { kind: "moon", position: { x: 0, y: 50, z: 0 } },
        { kind: "star", position: { x: 0, y: 50, z: 0 } },
      ],
      ground: flatGround,
    };

    const buffer = paintBackdrop(backdrop, bodyPixel);

    for (const offset of moonOffsets) {
      expect(buffer[offset]).toBe(99);
    }
  });
});

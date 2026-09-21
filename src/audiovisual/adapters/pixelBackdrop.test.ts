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

// Cycle 15: the ground is one index, no ridge, no fill split -- a true
// silhouette. A square 4x4 grid (worldHalfWidth 50, spanning the
// polyline exactly) whose control points sit exactly on the column
// centres, so every sampled height (25, 50, 75, 100) lands exactly
// halfway between two row centres (87.5, 62.5, 37.5, 12.5) -- 12.5 world
// units of margin either way, the widest a 4x4 grid allows, no rounding
// tie anywhere.
describe("paintBackdrop -- ground", () => {
  const groundGrid = { columns: 4, rows: 4 };
  const groundPixel: AudioVisualConfig["pixel"] = {
    ...defaultAudioVisualConfig.pixel,
    columns: groundGrid.columns,
    rows: groundGrid.rows,
    sky: [3, 3, 3, 3, 3], // flat and distinct from ground, easy to tell apart
    ground: 55,
  };
  const groundSlope: Backdrop["ground"] = [
    { x: -50, height: 25 },
    { x: -37.5, height: 25 },
    { x: -12.5, height: 50 },
    { x: 12.5, height: 75 },
    { x: 37.5, height: 100 },
    { x: 50, height: 100 },
  ];

  function paintedRows(buffer: Uint8Array, column: number): number[] {
    const rows: number[] = [];
    for (let row = 0; row < groundGrid.rows; row++) {
      if (buffer[row * groundGrid.columns + column] === 55) {
        rows.push(row);
      }
    }
    return rows;
  }

  it("paints a staircase, one row taller per column, from a rising slope", () => {
    const backdrop: Backdrop = {
      sky: { horizon: 0, zenith: 0 }, // ramps to index 3 regardless of y
      bodies: [],
      ground: groundSlope,
    };

    const buffer = paintBackdrop(backdrop, groundPixel);

    expect(paintedRows(buffer, 0)).toEqual([3]);
    expect(paintedRows(buffer, 1)).toEqual([2, 3]);
    expect(paintedRows(buffer, 2)).toEqual([1, 2, 3]);
    expect(paintedRows(buffer, 3)).toEqual([0, 1, 2, 3]);
  });

  it("paints ground last, covering a body inside the landform", () => {
    const backdrop: Backdrop = {
      sky: { horizon: 0, zenith: 0 },
      // Column 0's only ground pixel is row 3 -- put the moon exactly
      // there.
      bodies: [{ kind: "moon", position: { x: -37.5, y: 12.5, z: 0 } }],
      ground: groundSlope,
    };
    const pixel: AudioVisualConfig["pixel"] = {
      ...groundPixel,
      bodies: { ...groundPixel.bodies, moon: { index: 88, radius: 0.1 } },
    };

    const buffer = paintBackdrop(backdrop, pixel);

    expect(buffer[3 * groundGrid.columns + 0]).toBe(55);
  });
});

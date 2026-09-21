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

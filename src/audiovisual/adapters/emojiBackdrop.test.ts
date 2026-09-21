import { describe, expect, it } from "vitest";
import { rasteriseEmojiBackdrop } from "./emojiBackdrop.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop } from "../types.ts";

// Cycle 7 (docs/07_emoji_renderer.md): the emoji half of the world
// backdrop, the counterpart of rasteriseBackdrop. Same fixture shape:
// small grids, unusual glyphs, a five-character sky ramp so no space in
// it can hide a cell that drew nothing.

function config(
  overrides: Partial<AudioVisualConfig["emoji"]>,
): AudioVisualConfig["emoji"] {
  return { ...defaultAudioVisualConfig.emoji, ...overrides };
}

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

describe("rasteriseEmojiBackdrop", () => {
  it("draws the sky gradient brighter at the bottom, sampled at each row's centre, filling every cell", () => {
    // Uncapped sky on purpose — capping is buildSky's job in the core, not
    // this adapter's. Row 0's centre is y=75 -> brightness 0.25 -> index
    // round(0.25*4)=1 -> "q". Row 1's centre is y=25 -> brightness 0.75 ->
    // index round(0.75*4)=3 -> "s". No .5 rounding tie.
    const emoji = config({
      columns: 3,
      rows: 2,
      sky: ["p", "q", "r", "s", "t"],
    });

    const grid = rasteriseEmojiBackdrop(backdrop(), emoji);

    expect(grid).toEqual([
      ["q", "q", "q"],
      ["s", "s", "s"],
    ]);
  });
});

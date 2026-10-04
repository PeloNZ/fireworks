import { describe, expect, it } from "vitest";
import { rasteriseEmojiBackdrop } from "./emojiBackdrop.ts";
import { defaultSettings } from "../../config.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop } from "../types.ts";

// Cycle 7 (docs/07_emoji_renderer.md): the emoji half of the world
// backdrop, the counterpart of rasteriseBackdrop. Same fixture shape:
// small grids, unusual glyphs, a five-character sky ramp so no space in
// it can hide a cell that drew nothing.

function config(
  overrides: Partial<AudioVisualConfig["emoji"]>,
): AudioVisualConfig["emoji"] {
  return { ...defaultSettings.audiovisual.emoji, ...overrides };
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

  it("draws each body as its kind's glyph, with later bodies over earlier ones", () => {
    // Same 3x2 grid as asciiBackdrop.test.ts's own body fixture, through
    // the same shared toCell mapping — a body and a spark at one world
    // point land in the same cell.
    const emoji = config({
      columns: 3,
      rows: 2,
      sky: ["z", "z", "z", "z", "z"],
      backdropGlyphs: {
        ...defaultSettings.audiovisual.emoji.backdropGlyphs,
        star: "S",
        moon: "M",
        planet: "P",
      },
    });
    const withBodies = backdrop({
      bodies: [
        { kind: "star", position: { x: -40, y: 75, z: 0 } }, // row 0, col 0
        { kind: "star", position: { x: -40, y: 25, z: 0 } }, // row 1, col 0
        { kind: "planet", position: { x: 30, y: 25, z: 0 } }, // row 1, col 2
        // Last, so it wins the cell the first star wanted — paint order
        // is the whole mechanism, no overlap test anywhere.
        { kind: "moon", position: { x: -40, y: 75, z: 0 } },
      ],
    });

    expect(rasteriseEmojiBackdrop(withBodies, emoji)).toEqual([
      ["M", "z", "z"],
      ["S", "z", "P"],
    ]);
  });

  it("clips a body outside the world box instead of wrapping it to the opposite edge", () => {
    const emoji = config({
      columns: 3,
      rows: 2,
      sky: ["z", "z", "z", "z", "z"],
    });
    const offScreen = backdrop({
      bodies: [{ kind: "moon", position: { x: 1000, y: 50, z: 0 } }],
    });

    expect(rasteriseEmojiBackdrop(offScreen, emoji)).toEqual([
      ["z", "z", "z"],
      ["z", "z", "z"],
    ]);
  });

  describe("the ground, painted last", () => {
    // Same slope as asciiBackdrop.test.ts's own ground fixture: 4x4, a
    // black sky, sloping from height 15 at the left edge to 100 at the
    // right, tie-free. Column centres x = -37.5, -12.5, 12.5, 37.5 give
    // heights 25.625, 46.875, 68.125, 89.375; row centres y = 87.5, 62.5,
    // 37.5, 12.5.
    const emoji = config({
      columns: 4,
      rows: 4,
      sky: ["z", "z", "z", "z", "z"],
      backdropGlyphs: {
        ...defaultSettings.audiovisual.emoji.backdropGlyphs,
        ridge: "R",
        ground: "G",
      },
    });
    const sloped = backdrop({
      sky: { horizon: 0, zenith: 0 },
      ground: [
        { x: -50, height: 15 },
        { x: 50, height: 100 },
      ],
    });

    it("marks the topmost ground cell in each column with the ridge glyph and fills below it", () => {
      expect(rasteriseEmojiBackdrop(sloped, emoji)).toEqual([
        ["z", "z", "z", "R"],
        ["z", "z", "R", "G"],
        ["z", "R", "G", "G"],
        ["R", "G", "G", "G"],
      ]);
    });

    it("covers a body that sits inside the landform, since the ground paints last", () => {
      // Row 3, column 0 — a ridge cell in the fixture above.
      const buried = {
        ...sloped,
        bodies: [{ kind: "star" as const, position: { x: -40, y: 10, z: 0 } }],
      };

      expect(rasteriseEmojiBackdrop(buried, emoji)).toEqual([
        ["z", "z", "z", "R"],
        ["z", "z", "R", "G"],
        ["z", "R", "G", "G"],
        ["R", "G", "G", "G"],
      ]);
    });
  });
});

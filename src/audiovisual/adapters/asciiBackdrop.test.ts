import { describe, expect, it } from "vitest";
import { overlayGrid, rasteriseBackdrop } from "./asciiBackdrop.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop } from "../types.ts";

// Cycles 8-10 (docs/06_world_backdrop.md): the backdrop onto characters.
// Unlike rasteriseFrame, this walks cells and asks the core what the world
// looks like at each cell's centre — a backdrop has to cover the whole
// rectangle, including the top row, which a sprite at y = 100 cannot reach
// because the render box is half-open there.
//
// Every fixture uses a five-character ramp with no space in it, so a cell
// that accidentally drew nothing shows up as a failure instead of passing
// as a space, and unusual glyphs, so the real defaults ("*", "O", "o",
// "^") cannot pass by accident.

function config(overrides: {
  readonly ascii?: Partial<AudioVisualConfig["ascii"]>;
  readonly backdrop?: Partial<AudioVisualConfig["backdrop"]>;
}): AudioVisualConfig {
  return {
    ...defaultAudioVisualConfig,
    ascii: {
      ...defaultAudioVisualConfig.ascii,
      ramp: "abcde",
      backdropGlyphs: { star: "S", moon: "M", planet: "P", ridge: "R" },
      ...overrides.ascii,
    },
    backdrop: {
      ...defaultAudioVisualConfig.backdrop,
      ...overrides.backdrop,
    },
  };
}

// Three columns by two rows keeps every cell hand-checkable, and the row
// centres (y = 75 and y = 25) avoid any .5 rounding tie, so these
// assertions do not quietly depend on how Math.round breaks them.
const smallGrid = config({ ascii: { columns: 3, rows: 2 } });

// Ground flat at height 0 draws nothing, since no row's centre is at or
// below it — which is what keeps the cycle 8 and 9 fixtures unaffected by
// the ground painting added in cycle 10.
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
    expect(rasteriseBackdrop(backdrop(), smallGrid)).toBe(
      ["bbb", "ddd"].join("\n"),
    );
  });

  it("fills every cell of the grid, so a firework never composites onto a hole", () => {
    const lines = rasteriseBackdrop(backdrop(), smallGrid).split("\n");

    expect(lines).toHaveLength(smallGrid.ascii.rows);
    for (const line of lines) {
      expect(line).toHaveLength(smallGrid.ascii.columns);
    }
  });

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

    expect(rasteriseBackdrop(withBodies, smallGrid)).toBe(
      ["Mbb", "SdP"].join("\n"),
    );
  });

  it("clips a body outside the world box instead of wrapping it to the opposite edge", () => {
    const offScreen = backdrop({
      bodies: [{ kind: "moon", position: { x: 1000, y: 50, z: 0 } }],
    });

    expect(rasteriseBackdrop(offScreen, smallGrid)).toBe(
      ["bbb", "ddd"].join("\n"),
    );
  });

  describe("the ground, painted last", () => {
    // Four by four, a black sky so every non-ground cell is "a" and the
    // ground's own characters are unmistakable, and a skyline sloping from
    // height 15 at the left edge to 100 at the right. An unusual fill
    // brightness of 0.5 lands on ramp index 2 -> "c", so a hardcoded fill
    // character fails.
    //
    // Column centres are x = -37.5, -12.5, 12.5, 37.5, giving heights
    // 25.625, 46.875, 68.125 and 89.375. Row centres are y = 87.5, 62.5,
    // 37.5 and 12.5. No comparison ties, so the staircase is exact.
    const slope = config({
      ascii: { columns: 4, rows: 4 },
      backdrop: { groundFillBrightness: 0.5 },
    });
    const sloped = backdrop({
      sky: { horizon: 0, zenith: 0 },
      ground: [
        { x: -50, height: 15 },
        { x: 50, height: 100 },
      ],
    });

    it("marks the topmost ground cell in each column with the ridge glyph and fills below it", () => {
      expect(rasteriseBackdrop(sloped, slope)).toBe(
        ["aaaR", "aaRc", "aRcc", "Rccc"].join("\n"),
      );
    });

    it("covers a body that sits inside the landform, since the ground paints last", () => {
      // Row 3, column 0 — a ridge cell in the fixture above.
      const buried = {
        ...sloped,
        bodies: [{ kind: "star" as const, position: { x: -40, y: 10, z: 0 } }],
      };

      expect(rasteriseBackdrop(buried, slope)).toBe(
        ["aaaR", "aaRc", "aRcc", "Rccc"].join("\n"),
      );
    });
  });
});

// Cycle 11: compositing the finished foreground over the finished
// backdrop. One rule, and it is the rule that makes the whole design safe:
//
//   the foreground shows through unless it is blank.
//
// A foreground cell holding a space is already visually nothing — a sprite
// too dim to draw and an empty cell are indistinguishable on screen — so
// letting the sky show through either changes no visible output. The
// backdrop never enters rasteriseFrame's brightness map, so it can never
// claim a cell or win a tie against a decaying trail.

describe("overlayGrid", () => {
  it("takes the foreground's character where it has one, and the backdrop's where it does not", () => {
    expect(overlayGrid("abc\ndef", "X  \n Y ")).toBe("Xbc\ndYf");
  });

  it("lets the backdrop show through a sprite too dim to draw, instead of punching a hole in it", () => {
    // The trap this rule exists to avoid. If a blank foreground cell erased
    // the backdrop instead of revealing it, a decaying trail tail — which
    // maps to ramp[0], a space — would drag a moving black hole across the
    // sky. Something meant to be invisible must not become visible by
    // subtraction.
    const sky = "::::";
    const foregroundWithADimSprite = "  @ ";

    expect(overlayGrid(sky, foregroundWithADimSprite)).toBe("::@:");
  });

  it("leaves a cell blank when neither layer draws anything there", () => {
    expect(overlayGrid("   \n   ", "   \n   ")).toBe("   \n   ");
  });

  it("keeps the newlines exactly where they were, so the two grids cannot drift out of alignment", () => {
    const base = ["aaaa", "bbbb", "cccc"].join("\n");
    const over = ["X   ", "    ", "   Y"].join("\n");

    const composited = overlayGrid(base, over);

    expect(composited).toBe(["Xaaa", "bbbb", "cccY"].join("\n"));
    expect(composited.split("\n")).toHaveLength(3);
  });
});

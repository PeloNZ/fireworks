import { describe, expect, it } from "vitest";
import { rasteriseAmbient, rasteriseFrame } from "./asciiGrid.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Mover, Sprite, Frame } from "../types.ts";

// Cycle 4 (docs/05_audio_visual_layer.md): the interesting part of the
// ASCII adapter — world space to character cells — as a pure function
// returning a plain string, asserted in full. A small 9x5 grid keeps
// every position hand-checkable.

const ascii = { ...defaultAudioVisualConfig.ascii, columns: 9, rows: 5 };

function sprite(overrides: Partial<Sprite> = {}): Sprite {
  return {
    kind: "shell",
    position: { x: 0, y: 0, z: 0 },
    size: 1,
    color: { r: 1, g: 1, b: 1 },
    brightness: 1,
    ...overrides,
  };
}

// Builds the expected grid from a sparse list of filled cells, rather than
// hand-counting spaces in a string literal — the source of most off-by-one
// mistakes a test like this could hide.
function expectedGrid(
  columns: number,
  rows: number,
  filled: readonly { row: number; column: number; char: string }[],
): string {
  const charAt = (row: number, column: number): string =>
    filled.find((f) => f.row === row && f.column === column)?.char ?? " ";

  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = "";
    for (let column = 0; column < columns; column++) {
      line += charAt(row, column);
    }
    lines.push(line);
  }
  return lines.join("\n");
}

describe("rasteriseFrame", () => {
  it("flips y: a sprite near the top of world space lands near row 0, and one near the bottom lands near the bottom row", () => {
    const frame: Frame = {
      sprites: [
        sprite({ position: { x: -50, y: 90, z: 0 } }),
        sprite({ position: { x: -50, y: 10, z: 0 } }),
      ],
      ambient: [],
    };

    expect(rasteriseFrame(frame, ascii)).toBe(
      expectedGrid(9, 5, [
        { row: 0, column: 0, char: "@" },
        { row: 4, column: 0, char: "@" },
      ]),
    );
  });

  it("centres x: world x=0 lands at the centre column", () => {
    const frame: Frame = {
      sprites: [sprite({ position: { x: 0, y: 50, z: 0 } })],
      ambient: [],
    };

    expect(rasteriseFrame(frame, ascii)).toBe(
      expectedGrid(9, 5, [{ row: 2, column: 4, char: "@" }]),
    );
  });

  it("clips a sprite outside world bounds instead of wrapping it to the opposite edge", () => {
    const frame: Frame = {
      sprites: [sprite({ position: { x: 1000, y: 50, z: 0 } })],
      ambient: [],
    };

    expect(rasteriseFrame(frame, ascii)).toBe(expectedGrid(9, 5, []));
  });

  it("keeps the brighter sprite when two land in the same cell, regardless of array order", () => {
    const frame: Frame = {
      sprites: [
        sprite({ position: { x: 0, y: 50, z: 0 }, brightness: 0.2 }),
        sprite({ position: { x: 0, y: 50, z: 0 }, brightness: 1 }),
      ],
      ambient: [],
    };

    expect(rasteriseFrame(frame, ascii)).toBe(
      expectedGrid(9, 5, [{ row: 2, column: 4, char: "@" }]),
    );
  });
});

// Cycle 2 (docs/11_ambient_movers.md): a mover becomes one ramp character,
// on the same grid as the firework sprites. Positions are worked by hand on
// the 9x5 grid: (30, 30) is column floor(0.8 * 9) = 7, row 4 - floor(1.5) =
// 3; (-50, 90) is column 0, row 4 - floor(4.5) = 0. Brightness 0.2 is ramp
// index round(0.2 * 9) = 2, which is ":".

function mover(overrides: Partial<Mover> = {}): Mover {
  return {
    position: { x: 0, y: 0, z: 0 },
    brightness: 1,
    ...overrides,
  };
}

describe("rasteriseAmbient", () => {
  it("draws each mover as the ramp character for its brightness, in its own cell", () => {
    const movers = [
      mover({ position: { x: 30, y: 30, z: 0 }, brightness: 1 }),
      mover({ position: { x: -50, y: 90, z: 0 }, brightness: 0.2 }),
    ];

    expect(rasteriseAmbient(movers, ascii)).toBe(
      expectedGrid(9, 5, [
        { row: 3, column: 7, char: "@" },
        { row: 0, column: 0, char: ":" },
      ]),
    );
  });
});

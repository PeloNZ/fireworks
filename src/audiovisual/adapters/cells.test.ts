import { describe, expect, it } from "vitest";
import { columnCentreX, contestCells, rowCentreY, toCell } from "./cells.ts";
import type { Frame, Sprite } from "../types.ts";

// Cycle 1 (docs/07_emoji_renderer.md): the seam shared by both renderers.
// toCell, rowCentreY and columnCentreX move here unchanged from
// asciiGrid.ts and asciiBackdrop.ts. contestCells is new — it is the half
// of rasteriseFrame's job that has nothing to do with characters: which
// sprite wins each cell. A small 3x2 grid keeps every cell hand-checkable.

const grid = { columns: 3, rows: 2 };

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

describe("toCell", () => {
  it("flips y and centres x, matching the mapping the ASCII adapter has always used", () => {
    expect(toCell(0, 50, grid)).toEqual({ row: 0, column: 1 });
  });

  it("returns null outside the half-open box instead of wrapping", () => {
    expect(toCell(1000, 50, grid)).toBeNull();
  });
});

describe("rowCentreY / columnCentreX", () => {
  it("are the exact inverse of toCell's mapping", () => {
    expect(rowCentreY(0, grid.rows)).toBe(75);
    expect(rowCentreY(1, grid.rows)).toBe(25);
    expect(columnCentreX(1, grid.columns)).toBeCloseTo(0, 10);
  });
});

describe("contestCells", () => {
  it("returns the winning sprite itself, with its kind and color intact — not a character", () => {
    const winner = sprite({
      position: { x: 0, y: 50, z: 0 },
      kind: "spark",
      color: { r: 1, g: 0, b: 0 },
      brightness: 1,
    });
    const frame: Frame = { sprites: [winner], ambient: [] };

    const cells = contestCells(frame, grid);

    expect(cells[0]?.[1]).toBe(winner);
  });

  it("gives a strictly brighter later sprite the cell over an earlier, dimmer one", () => {
    const dim = sprite({ position: { x: 0, y: 50, z: 0 }, brightness: 0.2 });
    const bright = sprite({ position: { x: 0, y: 50, z: 0 }, brightness: 1 });
    const frame: Frame = { sprites: [dim, bright], ambient: [] };

    const cells = contestCells(frame, grid);

    expect(cells[0]?.[1]).toBe(bright);
  });

  it("keeps the earlier sprite when a later one is only equally bright", () => {
    const first = sprite({ position: { x: 0, y: 50, z: 0 }, brightness: 1 });
    const second = sprite({ position: { x: 0, y: 50, z: 0 }, brightness: 1 });
    const frame: Frame = { sprites: [first, second], ambient: [] };

    const cells = contestCells(frame, grid);

    expect(cells[0]?.[1]).toBe(first);
  });

  it("omits a sprite outside the grid instead of wrapping it to an edge", () => {
    const frame: Frame = {
      sprites: [sprite({ position: { x: 1000, y: 50, z: 0 } })],
      ambient: [],
    };

    const cells = contestCells(frame, grid);

    expect(cells.flat().every((cell) => cell === null)).toBe(true);
  });

  it("leaves an untouched cell as null", () => {
    const frame: Frame = { sprites: [], ambient: [] };

    const cells = contestCells(frame, grid);

    expect(cells).toEqual([
      [null, null, null],
      [null, null, null],
    ]);
  });
});

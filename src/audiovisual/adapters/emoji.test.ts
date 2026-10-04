import { describe, expect, it } from "vitest";
import { createEmojiRenderer } from "./emoji.ts";
import { overlayEmojiGrid, rasteriseEmojiFrame } from "./emojiGrid.ts";
import { rasteriseEmojiBackdrop } from "./emojiBackdrop.ts";
import { defaultSettings } from "../../config.ts";
import type { Backdrop, Frame, Mover } from "../types.ts";

// Cycle 10 (docs/07_emoji_renderer.md): the adapter itself, mirroring
// ascii.test.ts's own two cases — one write per call, and the two paths
// (no backdrop, a backdrop given) are exactly the composition their own
// pure functions would produce, joined into one string only at the end.

function createTarget(): {
  readonly target: { textContent: string };
  readonly writes: string[];
} {
  const writes: string[] = [];
  const target = {
    get textContent(): string {
      return writes.at(-1) ?? "";
    },
    set textContent(value: string) {
      writes.push(value);
    },
  };
  return { target, writes };
}

function shellFrame(): Frame {
  return {
    sprites: [
      {
        kind: "shell",
        position: { x: 0, y: 50, z: 0 },
        size: 1,
        color: { r: 1, g: 1, b: 1 },
        brightness: 1,
        velocity: { x: 0, y: 0, z: 0 },
      },
    ],
    ambient: [],
  };
}

function join(grid: readonly string[][]): string {
  return grid.map((row) => row.join("")).join("\n");
}

describe("createEmojiRenderer", () => {
  it("writes rasteriseEmojiFrame's output to the target exactly once per call", () => {
    const { target, writes } = createTarget();
    const renderer = createEmojiRenderer({
      target,
      config: defaultSettings.audiovisual,
      backdrop: null,
    });
    const frame = shellFrame();

    renderer(frame);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe(
      join(rasteriseEmojiFrame(frame, defaultSettings.audiovisual.emoji)),
    );
  });

  it("composites the frame over the backdrop when one is given", () => {
    // Unusual columns and rows, so what passes is the composition rather
    // than a coincidence at the default grid size.
    const config = {
      ...defaultSettings.audiovisual,
      emoji: { ...defaultSettings.audiovisual.emoji, columns: 7, rows: 3 },
    };
    const backdrop: Backdrop = {
      sky: { horizon: 0.2, zenith: 0.05 },
      bodies: [{ kind: "moon", position: { x: -30, y: 80, z: 0 } }],
      ground: [
        { x: -50, height: 8 },
        { x: 50, height: 20 },
      ],
    };
    const { target, writes } = createTarget();
    const renderer = createEmojiRenderer({ target, config, backdrop });
    const frame = shellFrame();

    renderer(frame);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe(
      join(
        overlayEmojiGrid(
          rasteriseEmojiBackdrop(backdrop, config.emoji),
          rasteriseEmojiFrame(frame, config.emoji),
          config.emoji.blank,
        ),
      ),
    );
  });
});

// Cycle 18 (docs/11_ambient_movers.md): the composite order, backdrop then
// movers then fireworks. The expected grids are written out by hand, not
// built with the functions under test, so a wrong layer order cannot pass. A
// 5x3 grid over a flat sky of brightness 0.2 is "🌌" in every cell, because
// the sky ramp has 5 glyphs and the index is round(0.2 * 4) = 1. A mover at
// (0, 50) is row 1, column 2. A shell at (-50, 90) is row 0, column 0.

describe("createEmojiRenderer with ambient movers", () => {
  const config = {
    ...defaultSettings.audiovisual,
    emoji: { ...defaultSettings.audiovisual.emoji, columns: 5, rows: 3 },
  };
  const flatSky: Backdrop = {
    sky: { horizon: 0.2, zenith: 0.2 },
    bodies: [],
    ground: [
      { x: -50, height: 0 },
      { x: 50, height: 0 },
    ],
  };
  const satellite: Mover = {
    kind: "satellite",
    position: { x: 0, y: 50, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    brightness: 0.6,
  };
  const firework = (x: number, y: number): Frame["sprites"][number] => ({
    kind: "shell",
    position: { x, y, z: 0 },
    size: 1,
    color: { r: 1, g: 1, b: 1 },
    brightness: 1,
    velocity: { x: 0, y: 0, z: 0 },
  });

  function draw(frame: Frame, backdrop: Backdrop | null): string | undefined {
    const { target, writes } = createTarget();
    createEmojiRenderer({ target, config, backdrop })(frame);
    return writes[0];
  }

  it("shows a mover over the sky, and the sky everywhere else", () => {
    const frame: Frame = { sprites: [], ambient: [satellite] };

    expect(draw(frame, flatSky)).toBe("🌌🌌🌌🌌🌌\n🌌🌌🛸🌌🌌\n🌌🌌🌌🌌🌌");
  });

  // This test passes before the mover pass exists. It guards the layer
  // order: a mover pass drawn over the fireworks fails it.
  it("shows a firework over a mover in the same cell", () => {
    const frame: Frame = {
      sprites: [firework(0, 50), firework(-50, 90)],
      ambient: [satellite],
    };

    expect(draw(frame, flatSky)).toBe("🚀🌌🌌🌌🌌\n🌌🌌🚀🌌🌌\n🌌🌌🌌🌌🌌");
  });

  it("shows a mover when there is no backdrop", () => {
    const frame: Frame = { sprites: [], ambient: [satellite] };

    expect(draw(frame, null)).toBe("⬛⬛⬛⬛⬛\n⬛⬛🛸⬛⬛\n⬛⬛⬛⬛⬛");
  });
});

import { describe, expect, it } from "vitest";
import { createEmojiRenderer } from "./emoji.ts";
import { overlayEmojiGrid, rasteriseEmojiFrame } from "./emojiGrid.ts";
import { rasteriseEmojiBackdrop } from "./emojiBackdrop.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Backdrop, Frame } from "../types.ts";

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
      },
    ],
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
      config: defaultAudioVisualConfig,
      backdrop: null,
    });
    const frame = shellFrame();

    renderer(frame);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe(
      join(rasteriseEmojiFrame(frame, defaultAudioVisualConfig.emoji)),
    );
  });

  it("composites the frame over the backdrop when one is given", () => {
    // Unusual columns and rows, so what passes is the composition rather
    // than a coincidence at the default grid size.
    const config = {
      ...defaultAudioVisualConfig,
      emoji: { ...defaultAudioVisualConfig.emoji, columns: 7, rows: 3 },
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

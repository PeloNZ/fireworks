import { describe, expect, it } from "vitest";
import { createAsciiRenderer } from "./ascii.ts";
import { rasteriseFrame } from "./asciiGrid.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Frame } from "../types.ts";

// Cycle 5 (docs/05_audio_visual_layer.md): the adapter itself is one
// assignment — target.textContent = rasteriseFrame(frame, config.ascii) —
// now that cycle 4 did the actual work. Tested against a fake target, a
// plain object shaped like the slice of a DOM element this needs, the
// same "port" pattern createKeyboardAdapter's KeyEventLike uses.

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

describe("createAsciiRenderer", () => {
  it("writes rasteriseFrame's output to the target exactly once per call", () => {
    const { target, writes } = createTarget();
    const renderer = createAsciiRenderer({
      target,
      config: defaultAudioVisualConfig,
    });
    const frame: Frame = {
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

    renderer(frame);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe(
      rasteriseFrame(frame, defaultAudioVisualConfig.ascii),
    );
  });
});

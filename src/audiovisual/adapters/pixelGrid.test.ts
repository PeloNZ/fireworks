import { describe, expect, it } from "vitest";
import { indexFor, sparkIndex } from "./pixelGrid.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Rgb, Sprite } from "../types.ts";

// Cycle 3 (docs/09_8bit_renderer.md): the pixel renderer is the emoji
// renderer with a palette index where the glyph was -- sparkIndex is
// sparkGlyph's exact structure, over AudioVisualConfig["pixel"] instead of
// ["emoji"]. An unusual two-entry hue table and a saturation floor driven
// away from the 0.15 default, so neither can pass by coincidence.

const pixel: AudioVisualConfig["pixel"] = {
  ...defaultAudioVisualConfig.pixel,
  sparkHues: [
    { hue: 10, index: 3 },
    { hue: 200, index: 12 },
  ],
  desaturated: 6,
  saturationFloor: 0.5,
};

// Full-saturation colours at a chosen hue and saturation, via a small
// HSV-to-RGB conversion -- the same helper emojiGrid.test.ts uses, so each
// test names the hue and saturation it means rather than a hand-picked
// triple.
function atHue(hue: number, saturation = 1): Rgb {
  const c = saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const m = 1 - saturation;
  return { r: r + m, g: g + m, b: b + m };
}

describe("sparkIndex", () => {
  it("picks the nearest hue's index, wrapping the short way round", () => {
    // 350 is 20 degrees from 10 the short way, 340 the long way.
    expect(sparkIndex(atHue(350), pixel)).toBe(3);
  });

  it("returns the desaturated index below the saturation floor", () => {
    // Driven at floor 0.5, never the 0.15 default -- a hardcoded floor
    // would pass a 0.3-saturation colour through to a hue index instead.
    expect(sparkIndex(atHue(10, 0.3), pixel)).toBe(6);
  });

  it("picks by hue once saturation clears the floor", () => {
    expect(sparkIndex(atHue(10, 0.6), pixel)).toBe(3);
  });
});

// Cycle 4: indexFor dispatches on sprite.kind, mirroring emojiGrid's
// glyphFor exactly. pixel.shell and pixel.trail arrive together with
// sparkIndex's dispatch because noImplicitReturns plus the three-member
// kind union forbid a partial switch.
describe("indexFor", () => {
  function sprite(overrides: Partial<Sprite> = {}): Sprite {
    return {
      kind: "shell",
      position: { x: 0, y: 0, z: 0 },
      size: 1,
      color: atHue(10),
      brightness: 1,
      ...overrides,
    };
  }

  it("returns the shell index for a shell, regardless of its colour", () => {
    const config = { ...pixel, shell: 2 };

    expect(indexFor(sprite({ kind: "shell", color: atHue(200) }), config)).toBe(
      2,
    );
  });

  it("returns sparkIndex's answer for a spark", () => {
    expect(indexFor(sprite({ kind: "spark", color: atHue(200) }), pixel)).toBe(
      12,
    );
  });

  it("picks a trail's index from brightness alone, ignoring its colour", () => {
    const config = { ...pixel, trail: [4, 5, 6] };

    expect(
      indexFor(
        sprite({ kind: "trail", color: atHue(200), brightness: 0.5 }),
        config,
      ),
    ).toBe(5);
  });
});

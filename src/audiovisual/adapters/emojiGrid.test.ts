import { describe, expect, it } from "vitest";
import { glyphFor, rampGlyph, sparkGlyph } from "./emojiGrid.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Rgb, Sprite } from "../types.ts";

// Cycle 3 (docs/07_emoji_renderer.md): the fact ASCII discards — colour —
// becomes a glyph. An unusual two-entry hue table, so the real seven-entry
// default can't pass by accident.

const emoji: AudioVisualConfig["emoji"] = {
  ...defaultAudioVisualConfig.emoji,
  sparkHues: [
    { hue: 10, glyph: "A" },
    { hue: 200, glyph: "B" },
  ],
  desaturated: "?",
  saturationFloor: 0.15,
};

// Full-saturation colours at a chosen hue, built via a small HSV-to-RGB
// so each test names the hue it means rather than a hand-picked triple.
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

describe("sparkGlyph", () => {
  it("picks the nearest hue in the table", () => {
    expect(sparkGlyph(atHue(15), emoji)).toBe("A");
    expect(sparkGlyph(atHue(190), emoji)).toBe("B");
  });

  it("wraps around the wheel: hue 350 is nearer 10 than it is to 200", () => {
    expect(sparkGlyph(atHue(350), emoji)).toBe("A");
  });

  it("returns the desaturated glyph for a colour below the saturation floor", () => {
    expect(sparkGlyph(atHue(10, 0.05), emoji)).toBe("?");
  });

  it("still matches by hue for a colour just above the saturation floor", () => {
    expect(sparkGlyph(atHue(10, 0.2), emoji)).toBe("A");
  });
});

// Cycle 4: rampGlyph mirrors rampChar over an array instead of a string.
// An unusual three-entry list, so brightness 0 returning the first entry
// (the blank, by house rule) can't be confused with an off-by-one that a
// two-entry list would hide.
const glyphs = ["dim", "mid", "bright"];

describe("rampGlyph", () => {
  it("returns the first entry at brightness 0 — the blank, by house rule", () => {
    expect(rampGlyph(0, glyphs)).toBe("dim");
  });

  it("returns the last entry at brightness 1", () => {
    expect(rampGlyph(1, glyphs)).toBe("bright");
  });

  it("rounds to the nearest entry in between", () => {
    expect(rampGlyph(0.5, glyphs)).toBe("mid");
  });

  it("clamps brightness outside 0..1", () => {
    expect(rampGlyph(-5, glyphs)).toBe("dim");
    expect(rampGlyph(5, glyphs)).toBe("bright");
  });
});

describe("glyphFor", () => {
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

  it("returns the shell glyph for a shell, regardless of its colour", () => {
    const config = { ...emoji, shell: "S" };

    expect(glyphFor(sprite({ kind: "shell", color: atHue(200) }), config)).toBe(
      "S",
    );
  });

  it("returns sparkGlyph's answer for a spark", () => {
    expect(glyphFor(sprite({ kind: "spark", color: atHue(190) }), emoji)).toBe(
      "B",
    );
  });

  it("picks a trail's glyph from brightness alone, ignoring its colour", () => {
    const config = { ...emoji, trail: glyphs };

    expect(
      glyphFor(
        sprite({ kind: "trail", color: atHue(200), brightness: 0 }),
        config,
      ),
    ).toBe("dim");
  });
});

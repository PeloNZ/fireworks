import { describe, expect, it } from "vitest";
import { hueOf, nearestHue, parseHexColor, saturationOf } from "./color.ts";

// Cycle 1 (docs/05_audio_visual_layer.md): every sprite's colour starts as
// a FireworkSpec's CSS hex string and has to become the 0..1 floats every
// later brightness and blend calculation in this layer works in.

describe("parseHexColor", () => {
  it("parses a 6-digit hex colour into 0..1 floats", () => {
    const result = parseHexColor("#ff3b30");

    expect(result.r).toBe(1);
    expect(result.g).toBeCloseTo(59 / 255);
    expect(result.b).toBeCloseTo(48 / 255);
  });

  it("parses uppercase hex digits the same way as lowercase", () => {
    expect(parseHexColor("#FF3B30")).toEqual(parseHexColor("#ff3b30"));
  });

  it("throws on a malformed string", () => {
    expect(() => parseHexColor("not-a-colour")).toThrow();
  });
});

// Cycle 2 (docs/07_emoji_renderer.md): the colour facts the emoji renderer
// needs to pick a glyph — hand-made values, checkable by eye, so a wrong
// formula fails rather than merely looking plausible.

describe("hueOf", () => {
  it("reads pure red as hue 0", () => {
    expect(hueOf({ r: 1, g: 0, b: 0 })).toBe(0);
  });

  it("reads pure green as hue 120", () => {
    expect(hueOf({ r: 0, g: 1, b: 0 })).toBe(120);
  });

  it("reads pure blue as hue 240", () => {
    expect(hueOf({ r: 0, g: 0, b: 1 })).toBe(240);
  });

  it("returns 0, not NaN, for a colour with no hue at all", () => {
    // A mid-grey has equal r, g and b — max and min coincide, so the usual
    // (g - b) / (max - min) division is 0 / 0. This is the divide-by-zero
    // the formula invites, guarded rather than left to surface as NaN.
    expect(hueOf({ r: 0.5, g: 0.5, b: 0.5 })).toBe(0);
  });

  it("wraps deep red back to near 0 rather than reporting it near 360", () => {
    // Slightly short of pure red toward blue — one step around the wheel
    // from hue 0 the short way, not the long way through 180.
    expect(hueOf({ r: 1, g: 0, b: 0.05 })).toBeCloseTo(357, 0);
  });
});

describe("saturationOf", () => {
  it("reads a grey as saturation 0", () => {
    expect(saturationOf({ r: 0.5, g: 0.5, b: 0.5 })).toBe(0);
  });

  it("reads pure red as saturation 1", () => {
    expect(saturationOf({ r: 1, g: 0, b: 0 })).toBe(1);
  });

  it("reads a pale, partly-washed-out red as partway between", () => {
    const saturation = saturationOf({ r: 1, g: 0.6, b: 0.6 });

    expect(saturation).toBeGreaterThan(0);
    expect(saturation).toBeLessThan(1);
  });
});

// Cycle 1 (docs/09_8bit_renderer.md): lifted out of the emoji adapter so a
// second adapter can search a hue table without importing from another
// adapter. A two-entry table, so a plain absolute-difference implementation
// (which ignores the wraparound) can be told apart from a correct one.

describe("nearestHue", () => {
  const entries = [
    { hue: 10, name: "A" },
    { hue: 200, name: "B" },
  ];

  it("wraps around the wheel: 350 is 20 degrees from 10, not 340", () => {
    // The load-bearing case. 350 is 340 degrees from 10 the long way and
    // only 20 the short way — an implementation that skips hueDistance's
    // wraparound picks B here instead of A.
    expect(nearestHue(350, entries)).toBe(entries[0]);
  });

  it("throws on an empty table", () => {
    expect(() => nearestHue(0, [])).toThrow();
  });
});

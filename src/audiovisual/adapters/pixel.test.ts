import { describe, expect, it } from "vitest";
import { toRgba } from "./pixel.ts";

// Cycle 16 (docs/09_8bit_renderer.md): palette indices expand to RGBA
// bytes, the last step before a canvas can draw them. A two-colour
// palette with byte values nothing else in the project uses, so RGBA
// order, the opaque alpha, and the four-bytes-per-pixel stride are all
// genuinely exercised rather than coincidentally right.

const palette = ["#010203", "#fe0405"];

describe("toRgba", () => {
  it("expands each index to its palette colour, opaque, in RGBA order", () => {
    const result = toRgba(new Uint8Array([1, 0]), palette, null);

    expect(result).toBeInstanceOf(Uint8ClampedArray);
    expect(Array.from(result)).toEqual([254, 4, 5, 255, 1, 2, 3, 255]);
  });

  it("writes transparent zero bytes for the transparent index", () => {
    const result = toRgba(new Uint8Array([1, 0]), palette, 0);

    expect(Array.from(result)).toEqual([254, 4, 5, 255, 0, 0, 0, 0]);
  });

  it("throws for a palette index out of range", () => {
    expect(() => toRgba(new Uint8Array([2]), palette, null)).toThrow();
  });
});

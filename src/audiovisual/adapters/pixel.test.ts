import { describe, expect, it } from "vitest";
import { createPixelRenderer, toRgba } from "./pixel.ts";
import { paintFrame } from "./pixelGrid.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { PixelTarget } from "./pixel.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop, Frame } from "../types.ts";

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

// Cycle 17 (docs/09_8bit_renderer.md): the renderer factory, mirroring
// createAsciiRenderer and createEmojiRenderer -- a fake target records
// every call, the same shape createTarget() takes in ascii.test.ts and
// emoji.test.ts. Unusual columns: 7, rows: 3, so a default-size
// coincidence can't pass.

function createTarget(): {
  readonly target: PixelTarget;
  readonly paints: {
    pixels: Uint8ClampedArray<ArrayBuffer>;
    width: number;
    height: number;
  }[];
} {
  const paints: {
    pixels: Uint8ClampedArray<ArrayBuffer>;
    width: number;
    height: number;
  }[] = [];
  const target: PixelTarget = {
    paint: (pixels, width, height) => {
      paints.push({ pixels, width, height });
    },
  };
  return { target, paints };
}

const pixelConfig: AudioVisualConfig["pixel"] = {
  ...defaultAudioVisualConfig.pixel,
  columns: 7,
  rows: 3,
};
const config: AudioVisualConfig = {
  ...defaultAudioVisualConfig,
  pixel: pixelConfig,
};
const frame: Frame = { sprites: [] };
const backdrop: Backdrop = {
  sky: { horizon: 0, zenith: 0 },
  bodies: [],
  ground: [
    { x: -50, height: 0 },
    { x: 50, height: 0 },
  ],
};

describe("createPixelRenderer", () => {
  it("paints the background plane exactly once, never again per frame", () => {
    const background = createTarget();
    const sprites = createTarget();
    const renderer = createPixelRenderer({
      background: background.target,
      sprites: sprites.target,
      config,
      backdrop,
    });

    expect(background.paints).toHaveLength(1);
    renderer(frame);
    renderer(frame);
    expect(background.paints).toHaveLength(1);
  });

  it("paints the sprite plane every frame, matching paintFrame and toRgba directly", () => {
    const background = createTarget();
    const sprites = createTarget();
    const renderer = createPixelRenderer({
      background: background.target,
      sprites: sprites.target,
      config,
      backdrop,
    });

    renderer(frame);
    renderer(frame);

    expect(sprites.paints).toHaveLength(2);
    const expected = toRgba(
      paintFrame(frame, pixelConfig),
      pixelConfig.palette,
      pixelConfig.blank,
    );
    for (const paint of sprites.paints) {
      expect(paint.pixels).toEqual(expected);
      expect(paint.width).toBe(pixelConfig.columns);
      expect(paint.height).toBe(pixelConfig.rows);
    }
  });

  it("paints the sprite plane with no background and no backdrop", () => {
    const sprites = createTarget();
    const renderer = createPixelRenderer({
      background: null,
      sprites: sprites.target,
      config,
      backdrop: null,
    });

    expect(() => {
      renderer(frame);
    }).not.toThrow();
    expect(sprites.paints).toHaveLength(1);
  });
});

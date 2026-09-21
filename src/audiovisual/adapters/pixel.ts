import { paintFrame } from "./pixelGrid.ts";
import { paintBackdrop } from "./pixelBackdrop.ts";
import { parseHexColor } from "../color.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop, Renderer } from "../types.ts";

// The thin pixel renderer: owns the canvas port and the last step from
// palette indices to real colour. Everything upstream of this file
// (pixelGrid.ts, pixelBackdrop.ts) works in indices only — no alpha, no
// RGB, since a fixed 16-colour palette is the whole point. Grown one
// cycle at a time — see docs/09_8bit_renderer.md.

/**
 * Expands a buffer of palette indices to RGBA bytes, one pixel per four
 * bytes, red-green-blue-alpha — the shape `ImageData` expects. Every
 * pixel is opaque (`alpha: 255`) except `transparentIndex`, which writes
 * four zero bytes instead: `Uint8ClampedArray` starts zero-filled, so
 * that pixel is simply left untouched. `null` means every pixel is
 * opaque, for the background plane, which is never composited over
 * anything and has nothing to be transparent to.
 */
export function toRgba(
  indices: Uint8Array,
  palette: readonly string[],
  transparentIndex: number | null,
): Uint8ClampedArray<ArrayBuffer> {
  const result = new Uint8ClampedArray(indices.length * 4);

  for (const [i, index] of indices.entries()) {
    if (index === transparentIndex) {
      continue;
    }
    const hex = palette[index];
    if (hex === undefined) {
      throw new Error(`toRgba: palette index ${index.toString()} out of range`);
    }
    const { r, g, b } = parseHexColor(hex);
    const offset = i * 4;
    result[offset] = r * 255;
    result[offset + 1] = g * 255;
    result[offset + 2] = b * 255;
    result[offset + 3] = 255;
  }

  return result;
}

/**
 * The minimal slice of a canvas 2D context this renderer needs — a
 * "port", the same pattern `TextTarget` and `AudioContextLike` are. A
 * real `putImageData` call satisfies it; tests use a plain object that
 * records what it was called with instead. See "Why a fake target beats
 * jsdom" in docs/03_plan_control_layer.md.
 */
export interface PixelTarget {
  paint(
    pixels: Uint8ClampedArray<ArrayBuffer>,
    width: number,
    height: number,
  ): void;
}

/**
 * Builds a `Renderer` that paints two planes: `background`, once here
 * — outside the returned closure, the same "rasterise once" optimisation
 * `createAsciiRenderer` uses — and `sprites`, every frame. `background`
 * is `null` when there is no backdrop to paint at all, so `main.ts` need
 * not create a second canvas with nothing to put on it.
 *
 * The sprite plane's buffer carries real transparency (`pixel.blank` is
 * its transparent index), so the background plane shows through wherever
 * a frame draws nothing — `putImageData` replaces destination pixels
 * including alpha, so this is what lets two canvases composite at all.
 * The background plane itself is fully opaque (`transparentIndex: null`)
 * — it is never composited over anything.
 */
export function createPixelRenderer(options: {
  readonly background: PixelTarget | null;
  readonly sprites: PixelTarget;
  readonly config: AudioVisualConfig;
  readonly backdrop: Backdrop | null;
}): Renderer {
  const { background, sprites, config, backdrop } = options;
  const { pixel } = config;

  if (background !== null && backdrop !== null) {
    background.paint(
      toRgba(paintBackdrop(backdrop, pixel), pixel.palette, null),
      pixel.columns,
      pixel.rows,
    );
  }

  return (frame) => {
    sprites.paint(
      toRgba(paintFrame(frame, pixel), pixel.palette, pixel.blank),
      pixel.columns,
      pixel.rows,
    );
  };
}

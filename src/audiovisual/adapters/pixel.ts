import { parseHexColor } from "../color.ts";

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

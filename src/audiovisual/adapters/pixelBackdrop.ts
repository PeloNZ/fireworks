import { pixelCentreY } from "./pixelGrid.ts";
import { rampLevel } from "./ramp.ts";
import { skyBrightnessAt } from "../backdrop.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop } from "../types.ts";

// The pixel half of the backdrop renderer: the sky, celestial bodies and
// ground as a buffer of palette indices, painted once per page load
// outside the per-frame render loop. Grown one cycle at a time — see
// docs/09_8bit_renderer.md.

/**
 * Fills a `pixel.rows * pixel.columns` buffer with the sky's brightness,
 * ramped to a palette index — one row at a time, since sky brightness
 * depends only on `y`. Every pixel is filled here: the background plane
 * is fully opaque by contract, so bodies and ground (cycles 14, 15) only
 * ever paint over this, never leave a gap in it.
 */
export function paintBackdrop(
  backdrop: Backdrop,
  pixel: AudioVisualConfig["pixel"],
): Uint8Array {
  const { columns, rows } = pixel;
  const buffer = new Uint8Array(columns * rows);

  for (let row = 0; row < rows; row++) {
    const brightness = skyBrightnessAt(backdrop.sky, pixelCentreY(row, pixel));
    const index = rampLevel(brightness, pixel.sky);
    for (let column = 0; column < columns; column++) {
      buffer[row * columns + column] = index;
    }
  }

  return buffer;
}

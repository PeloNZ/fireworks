import { discCells, pixelCentreY } from "./pixelGrid.ts";
import { rampLevel } from "./ramp.ts";
import { skyBrightnessAt } from "../backdrop.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop, CelestialBody } from "../types.ts";

function styleFor(
  body: CelestialBody,
  bodies: AudioVisualConfig["pixel"]["bodies"],
): { readonly index: number; readonly radius: number } {
  switch (body.kind) {
    case "star":
      return bodies.star;
    case "moon":
      return bodies.moon;
    case "planet":
      return bodies.planet;
  }
}

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

  // Paint order does the work of an overlap test, the same rule the
  // ASCII and emoji backdrops use: later entries in backdrop.bodies win.
  // No brightness contest here -- CelestialBody carries no brightness
  // field to contest with.
  for (const body of backdrop.bodies) {
    const style = styleFor(body, pixel.bodies);
    for (const offset of discCells(body.position, style.radius, pixel)) {
      buffer[offset] = style.index;
    }
  }

  return buffer;
}

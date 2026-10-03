// The neon renderer's pure half: turns world-space data into plain values
// in canvas pixels. It calls no canvas function. `neon.ts` replays the
// values onto a canvas port. See docs/12_neon_renderer.md.

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * World space to canvas pixels. World y runs 0..100 upward from the bottom
 * edge and x runs `50 * width / height` units either side of the middle, so
 * one world unit is `height / 100` pixels on both axes and a round burst
 * stays round on any canvas shape. Canvas y grows downward.
 */
export function toCanvas(
  world: { readonly x: number; readonly y: number },
  canvas: { readonly width: number; readonly height: number },
): Point {
  return {
    x: canvas.width / 2 + (world.x * canvas.height) / 100,
    y: canvas.height - (world.y * canvas.height) / 100,
  };
}

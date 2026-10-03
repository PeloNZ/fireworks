// The neon renderer's pure half: turns world-space data into plain values
// in canvas pixels. It calls no canvas function. `neon.ts` replays the
// values onto a canvas port. See docs/12_neon_renderer.md.

import type { AudioVisualConfig } from "../config.ts";
import type { Frame, Rgb } from "../types.ts";

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A line with round ends, from `from` to `to`, `width` pixels thick. */
interface Streak {
  readonly from: Point;
  readonly to: Point;
  readonly width: number;
  readonly color: Rgb;
  readonly alpha: number; // 0..1
}

/** A filled circle, `radius` pixels across from the centre. */
interface Disc {
  readonly centre: Point;
  readonly radius: number;
  readonly color: Rgb;
  readonly alpha: number; // 0..1
}

/** What the light canvas draws for one frame, in the order drawn. */
export interface NeonLight {
  readonly streaks: readonly Streak[];
  readonly discs: readonly Disc[];
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

/**
 * Turns one frame's sprites into the shapes the light canvas draws. A
 * sprite that moves is a streak: a line from where it was `streakMs` ago
 * to where it is now, along its velocity.
 */
export function neonFrame(
  frame: Frame,
  config: AudioVisualConfig["neon"],
  canvas: { readonly width: number; readonly height: number },
): NeonLight {
  const scale = canvas.height / 100;
  const seconds = config.streakMs / 1000;
  const streaks: Streak[] = [];

  for (const { position, velocity, size, color, brightness } of frame.sprites) {
    streaks.push({
      from: toCanvas(
        {
          x: position.x - velocity.x * seconds,
          y: position.y - velocity.y * seconds,
        },
        canvas,
      ),
      to: toCanvas(position, canvas),
      width: 2 * size * scale,
      color,
      alpha: brightness,
    });
  }

  return { streaks, discs: [] };
}

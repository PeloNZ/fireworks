// The neon renderer's pure half: turns world-space data into plain values
// in canvas pixels. It calls no canvas function. `neon.ts` replays the
// values onto a canvas port. See docs/12_neon_renderer.md.

import type { AudioVisualConfig } from "../config.ts";
import { groundHeightAt } from "../backdrop.ts";
import { worldHalfWidth } from "./pixelGrid.ts";
import type { Vec3 } from "../../action/types.ts";
import type { Backdrop, Frame, Rgb } from "../types.ts";

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

/** What the backdrop canvas draws once, in canvas pixels. */
export interface NeonBackdrop {
  // The ridge, left to right, from the left canvas edge to the right one.
  readonly ridge: readonly Point[];
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
 * Turns one frame into the shapes the light canvas draws. One rule covers a
 * sprite and a mover: a streak is a line from where it was `tail` ago to
 * where it is now, along its velocity, and a streak with no length has no
 * direction, so it is a disc. A sprite's tail is `streakMs`. A mover's tail
 * is `moverTailMs` for its kind, so a satellite is a dot. A moving shell
 * also gets a hot core disc at its head.
 */
export function neonFrame(
  frame: Frame,
  config: AudioVisualConfig["neon"],
  canvas: { readonly width: number; readonly height: number },
): NeonLight {
  const scale = canvas.height / 100;
  const streaks: Streak[] = [];
  const discs: Disc[] = [];

  // Returns true when it drew a streak.
  const place = (
    position: Vec3,
    velocity: Vec3,
    tailMs: number,
    size: number,
    color: Rgb,
    alpha: number,
  ): boolean => {
    const dx = (velocity.x * tailMs) / 1000;
    const dy = (velocity.y * tailMs) / 1000;
    if (dx === 0 && dy === 0) {
      discs.push({
        centre: toCanvas(position, canvas),
        radius: size * scale,
        color,
        alpha,
      });
      return false;
    }
    streaks.push({
      from: toCanvas({ x: position.x - dx, y: position.y - dy }, canvas),
      to: toCanvas(position, canvas),
      width: 2 * size * scale,
      color,
      alpha,
    });
    return true;
  };

  for (const sprite of frame.sprites) {
    const { kind, position, velocity, size, color, brightness } = sprite;
    const streaked = place(
      position,
      velocity,
      config.streakMs,
      size,
      color,
      brightness,
    );
    if (streaked && kind === "shell") {
      discs.push({
        centre: toCanvas(position, canvas),
        radius: size * config.shellCore.scale * scale,
        color: config.shellCore.color,
        alpha: brightness,
      });
    }
  }

  for (const mover of frame.ambient) {
    place(
      mover.position,
      mover.velocity,
      config.moverTailMs[mover.kind],
      config.moverSize,
      config.moverColor,
      mover.brightness,
    );
  }

  return { streaks, discs };
}

/**
 * Turns the backdrop into the shapes the backdrop canvas draws once. The
 * ridge is the ground points that are on the canvas, with a point at each
 * canvas edge at the height `groundHeightAt` gives there. `Backdrop.ground`
 * stops at x = +-50 and a wide canvas shows more than that, so without the
 * edge points the ridge would stop short of both sides.
 */
export function neonBackdrop(
  backdrop: Backdrop,
  canvas: { readonly width: number; readonly height: number },
): NeonBackdrop {
  // `worldHalfWidth` takes a grid; a canvas is a grid of one-pixel cells.
  const halfWidth = worldHalfWidth({
    columns: canvas.width,
    rows: canvas.height,
  });
  const onCanvas = backdrop.ground.filter(
    ({ x }) => x > -halfWidth && x < halfWidth,
  );
  const points = [
    { x: -halfWidth, height: groundHeightAt(backdrop.ground, -halfWidth) },
    ...onCanvas,
    { x: halfWidth, height: groundHeightAt(backdrop.ground, halfWidth) },
  ];

  return {
    ridge: points.map(({ x, height }) => toCanvas({ x, y: height }, canvas)),
  };
}

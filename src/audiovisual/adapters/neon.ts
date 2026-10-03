// The neon renderer's thin half: replays the plain values `neonScene.ts`
// makes onto a canvas port. It calls no DOM function, so it is tested with a
// recording fake. `main.ts` makes the canvases. See docs/12_neon_renderer.md.

import { neonBackdrop, neonFrame } from "./neonScene.ts";
import type { NeonBackdrop } from "./neonScene.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop, Renderer, Rgb } from "../types.ts";

/**
 * The slice of `CanvasRenderingContext2D` the player uses. A real context is
 * assignable to it, and a test fake records what is written to it.
 */
export interface Canvas2DLike {
  globalCompositeOperation: "source-over" | "lighter";
  fillStyle: string;
  lineWidth: number;
  lineCap: "butt" | "round" | "square";
  strokeStyle: string;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
}

interface NeonSurface {
  readonly context: Canvas2DLike;
  readonly width: number; // pixels
  readonly height: number; // pixels
}

// `Rgb` floats are read as Display P3, so pure red is P3 red, which is more
// saturated than sRGB red. A canvas made without the P3 option maps the
// colour into sRGB.
function p3({ r, g, b }: Rgb, alpha: number): string {
  return `color(display-p3 ${String(r)} ${String(g)} ${String(b)} / ${String(alpha)})`;
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };

// Paints the backdrop surface: a black sky, the ground under the ridge, a
// cross for each star and a ring for the moon and the planet. The ridge line
// itself is drawn on the light surface, so that it glows.
function paintBackground(
  surface: NeonSurface,
  { ridge, stars, rings }: NeonBackdrop,
  config: AudioVisualConfig["neon"],
): void {
  const { context, width, height } = surface;
  const scale = height / 100;

  context.fillStyle = p3(BLACK, 1);
  context.fillRect(0, 0, width, height);

  context.fillStyle = p3(config.groundFill, 1);
  context.beginPath();
  ridge.forEach(({ x, y }, index) => {
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fill();

  for (const { centre, arm } of stars) {
    context.strokeStyle = p3(config.starColor, 1);
    context.lineWidth = config.starWidth * scale;
    context.beginPath();
    context.moveTo(centre.x - arm, centre.y);
    context.lineTo(centre.x + arm, centre.y);
    context.moveTo(centre.x, centre.y - arm);
    context.lineTo(centre.x, centre.y + arm);
    context.stroke();
  }

  for (const { centre, radius } of rings) {
    context.strokeStyle = p3(config.ringColor, 1);
    context.lineWidth = config.ringWidth * scale;
    context.beginPath();
    context.arc(centre.x, centre.y, radius, 0, 2 * Math.PI);
    context.stroke();
  }
}

export function createNeonRenderer(options: {
  readonly light: NeonSurface;
  readonly background: NeonSurface;
  readonly backdrop: Backdrop;
  readonly config: AudioVisualConfig["neon"];
}): Renderer {
  const { light, background, backdrop, config } = options;
  const scene = neonBackdrop(backdrop, config, light);
  const scale = light.height / 100;

  paintBackground(background, scene, config);

  return (frame) => {
    const { streaks, discs } = neonFrame(frame, config, light);
    const context = light.context;

    context.clearRect(0, 0, light.width, light.height);
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";

    context.strokeStyle = p3(config.ridgeColor, 1);
    context.lineWidth = config.ridgeWidth * scale;
    context.beginPath();
    scene.ridge.forEach(({ x, y }, index) => {
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();

    for (const { from, to, width, color, alpha } of streaks) {
      context.strokeStyle = p3(color, alpha);
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }

    for (const { centre, radius, color, alpha } of discs) {
      context.fillStyle = p3(color, alpha);
      context.beginPath();
      context.arc(centre.x, centre.y, radius, 0, 2 * Math.PI);
      context.fill();
    }
  };
}

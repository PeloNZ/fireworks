// The neon renderer's thin half: replays the plain values `neonScene.ts`
// makes onto a canvas port. It calls no DOM function, so it is tested with a
// recording fake. `main.ts` makes the canvases. See docs/12_neon_renderer.md.

import { neonFrame } from "./neonScene.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Renderer, Rgb } from "../types.ts";

/**
 * The slice of `CanvasRenderingContext2D` the player uses. A real context is
 * assignable to it, and a test fake records what is written to it.
 */
export interface Canvas2DLike {
  lineWidth: number;
  lineCap: "butt" | "round" | "square";
  strokeStyle: string;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
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

export function createNeonRenderer(options: {
  readonly light: NeonSurface;
  readonly config: AudioVisualConfig["neon"];
}): Renderer {
  const { light, config } = options;

  return (frame) => {
    const { streaks } = neonFrame(frame, config, light);
    const context = light.context;
    context.lineCap = "round";
    for (const { from, to, width, color, alpha } of streaks) {
      context.strokeStyle = p3(color, alpha);
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
  };
}

import { rasteriseFrame } from "./asciiGrid.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Renderer } from "../types.ts";

/**
 * The minimal slice of a DOM element this renderer needs — a "port", the
 * same pattern createKeyboardAdapter's `KeyEventLike` uses. A real `<pre>`
 * element satisfies it; tests use a plain object instead. See "Why a fake
 * target beats jsdom" in docs/03_plan_control_layer.md.
 */
export interface TextTarget {
  textContent: string;
}

/**
 * Builds a `Renderer` that writes each frame's grid into `target` as one
 * string, replacing whatever was there before. All the actual work —
 * world space to cells, the `y` flip, clipping, draw order — is
 * `rasteriseFrame`; this is the one line that reaches into the DOM.
 */
export function createAsciiRenderer(options: {
  readonly target: TextTarget;
  readonly config: AudioVisualConfig;
}): Renderer {
  const { target, config } = options;
  return (frame) => {
    target.textContent = rasteriseFrame(frame, config.ascii);
  };
}

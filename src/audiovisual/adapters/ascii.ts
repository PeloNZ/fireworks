import { rasteriseAmbient, rasteriseFrame } from "./asciiGrid.ts";
import { overlayGrid, rasteriseBackdrop } from "./asciiBackdrop.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop, Renderer } from "../types.ts";

/**
 * The minimal slice of a DOM element this renderer needs — a "port", the
 * same pattern createKeyboardAdapter's `KeyEventLike` uses. A real `<pre>`
 * element satisfies it (`Node.textContent` is typed `string | null`);
 * tests use a plain object instead. See "Why a fake target beats jsdom"
 * in docs/03_plan_control_layer.md.
 */
export interface TextTarget {
  textContent: string | null;
}

/**
 * Builds a `Renderer` that writes each frame's grid into `target` as one
 * string, replacing whatever was there before. All the actual work —
 * world space to cells, the `y` flip, clipping, draw order — is
 * `rasteriseFrame`; this is the one line that reaches into the DOM.
 *
 * `backdrop` of `null` means no sky, and reproduces the pre-backdrop
 * output exactly. Given one, it is rasterised **once, here**, outside the
 * returned closure — nothing in a backdrop changes frame to frame, so
 * re-rasterising 3200 cells sixty times a second would be pure waste. The
 * frame then composites over it: the foreground wins every cell it draws
 * in, and the sky shows through the ones it leaves blank. See
 * docs/06_world_backdrop.md.
 *
 * The frame's ambient movers draw in a layer of their own, between the
 * backdrop and the fireworks: a mover replaces the sky, and a firework
 * replaces a mover. See docs/11_ambient_movers.md.
 */
export function createAsciiRenderer(options: {
  readonly target: TextTarget;
  readonly config: AudioVisualConfig;
  readonly backdrop: Backdrop | null;
}): Renderer {
  const { target, config, backdrop } = options;
  const base = backdrop === null ? null : rasteriseBackdrop(backdrop, config);
  return (frame) => {
    const ambient = rasteriseAmbient(frame.ambient, config.ascii);
    const behind = base === null ? ambient : overlayGrid(base, ambient);
    target.textContent = overlayGrid(
      behind,
      rasteriseFrame(frame, config.ascii),
    );
  };
}

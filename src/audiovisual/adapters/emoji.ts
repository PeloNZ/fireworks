import {
  overlayEmojiGrid,
  rasteriseEmojiAmbient,
  rasteriseEmojiFrame,
} from "./emojiGrid.ts";
import { rasteriseEmojiBackdrop } from "./emojiBackdrop.ts";
import type { TextTarget } from "./ascii.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop, Renderer } from "../types.ts";

/**
 * Builds a `Renderer` that writes each frame's grid into `target` as one
 * string — the emoji counterpart of `createAsciiRenderer`, same shape,
 * same contract, same `TextTarget` port. The only difference is the last
 * step: `rasteriseEmojiFrame` and `rasteriseEmojiBackdrop` both return
 * `readonly string[][]`, joined into one string only here, at the very
 * last moment before anything touches the DOM — everywhere before this,
 * joining early would make a later cell-by-cell operation index into an
 * emoji's second UTF-16 code unit instead of its next cell.
 *
 * `backdrop` of `null` means no sky. Given one, it is rasterised **once,
 * here**, outside the returned closure, exactly as `createAsciiRenderer`
 * does — nothing in a backdrop changes frame to frame. Each frame's
 * `ambient` movers draw over the backdrop and under the fireworks. See
 * docs/11_ambient_movers.md.
 */
export function createEmojiRenderer(options: {
  readonly target: TextTarget;
  readonly config: AudioVisualConfig;
  readonly backdrop: Backdrop | null;
}): Renderer {
  const { target, config, backdrop } = options;
  const { emoji } = config;
  const base =
    backdrop === null ? null : rasteriseEmojiBackdrop(backdrop, emoji);

  return (frame) => {
    // Painted back to front: backdrop, then movers, then fireworks. With no
    // backdrop the movers are the base. They fill every cell with `blank`
    // where no mover sits, so nothing needs a fallback.
    const ambient = rasteriseEmojiAmbient(frame.ambient, emoji);
    const behind =
      base === null ? ambient : overlayEmojiGrid(base, ambient, emoji.blank);
    const composited = overlayEmojiGrid(
      behind,
      rasteriseEmojiFrame(frame, emoji),
      emoji.blank,
    );
    target.textContent = composited.map((row) => row.join("")).join("\n");
  };
}

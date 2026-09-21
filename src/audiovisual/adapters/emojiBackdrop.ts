// The emoji half of the world backdrop: turning a Backdrop's world-space
// facts into glyphs. Grown one cycle at a time — see
// docs/07_emoji_renderer.md.
//
// This is the only place in the backdrop's emoji code allowed to name a
// glyph. The core (backdrop.ts) decides only what is where and how
// bright it is, the same house rule asciiBackdrop.ts follows.

import { rowCentreY } from "./cells.ts";
import { rampGlyph } from "./emojiGrid.ts";
import { skyBrightnessAt } from "../backdrop.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Backdrop } from "../types.ts";

/**
 * Rasterises the static backdrop to a grid of glyphs — the emoji
 * counterpart of `rasteriseBackdrop`, on `readonly string[][]` instead of
 * a joined string.
 *
 * Painted bottom to top, the sky fills every cell first — so the
 * foreground always has something to composite onto, the same contract
 * `overlayEmojiGrid` leans on with no fallback of its own.
 *
 * Takes only `AudioVisualConfig["emoji"]`, unlike `rasteriseBackdrop`
 * which takes the whole config: the emoji ground has one fixed glyph and
 * no brightness to look up, so there is no second slice of config to
 * reach for.
 */
export function rasteriseEmojiBackdrop(
  backdrop: Backdrop,
  emoji: AudioVisualConfig["emoji"],
): readonly string[][] {
  const { columns, rows, sky } = emoji;

  const cells: string[][] = [];
  for (let row = 0; row < rows; row++) {
    const brightness = skyBrightnessAt(backdrop.sky, rowCentreY(row, rows));
    cells.push(new Array<string>(columns).fill(rampGlyph(brightness, sky)));
  }

  return cells;
}

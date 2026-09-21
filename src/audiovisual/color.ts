import type { Rgb } from "./types.ts";

/**
 * Parses a 6-digit CSS hex colour ("#ff3b30") into an Rgb of three floats
 * in 0..1. Throws on anything else — a FireworkSpec's colours are trusted
 * to be well-formed, so a malformed string means something upstream is
 * broken, not a case to render around.
 */
export function parseHexColor(hex: string): Rgb {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`invalid hex color: "${hex}"`);
  }
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

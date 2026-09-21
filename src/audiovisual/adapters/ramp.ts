// A brightness-to-entry lookup, shared by every adapter that ramps
// dimmest to brightest over a fixed list. `rampChar` (ASCII) indexes a
// string directly and stays its own function -- a genuinely different
// shape. See docs/09_8bit_renderer.md.

/**
 * Maps a brightness in 0..1 onto one entry in `levels`, dimmest first.
 * The emoji renderer's `rampGlyph` and the pixel renderer's brightness
 * ramps both delegate here.
 */
export function rampLevel<T>(brightness: number, levels: readonly T[]): T {
  const clamped = Math.min(1, Math.max(0, brightness));
  const index = Math.round(clamped * (levels.length - 1));
  const level = levels[index];
  if (level === undefined) {
    // index is always within [0, levels.length - 1] for a clamped
    // brightness and a non-empty list. noUncheckedIndexedAccess can't see
    // that, so it types this access as possibly undefined regardless.
    throw new Error("unreachable: ramp index out of range");
  }
  return level;
}

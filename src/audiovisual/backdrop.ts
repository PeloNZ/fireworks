// The world backdrop's core: what the sky looks like and where its
// scenery sits, all in world space, all seeded, all pure. Grown one cycle
// at a time — see docs/06_world_backdrop.md.
//
// Nothing here chooses a character. A glyph is a rendering decision and
// belongs to an adapter; this file decides only what is where and how
// bright it is, so an ASCII grid and a future Canvas draw the same sky
// from the same seed.

import type { SkyGradient } from "./types.ts";

// World space is 100 units tall, `y` growing up — the same extent
// asciiGrid.ts maps onto rows. Duplicated deliberately rather than
// promoted into WorldConfig: that would touch Action's tested physics
// config for no behaviour change. See docs/06_world_backdrop.md.
const WORLD_TOP = 100;

/**
 * The sky's brightness at world height `y`: the straight line between
 * `sky.horizon` (at `y = 0`) and `sky.zenith` (at `y = 100`). Same
 * interpolation `lerpVec3` does for a shell's position, on one number.
 */
export function skyBrightnessAt(sky: SkyGradient, y: number): number {
  return sky.horizon + (sky.zenith - sky.horizon) * (y / WORLD_TOP);
}

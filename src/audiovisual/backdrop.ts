// The world backdrop's core: what the sky looks like and where its
// scenery sits, all in world space, all seeded, all pure. Grown one cycle
// at a time — see docs/06_world_backdrop.md.
//
// Nothing here chooses a character. A glyph is a rendering decision and
// belongs to an adapter; this file decides only what is where and how
// bright it is, so an ASCII grid and a future Canvas draw the same sky
// from the same seed.

import { createRandom } from "../action/random.ts";
import type { AudioVisualConfig } from "./config.ts";
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

/**
 * Draws one sky from `seed`, anywhere from a solid black night to a dim
 * sunset. Two draws are enough for that whole range: `horizon` sets how
 * lit the sky is at all, and `zenith` is a fraction *of* `horizon`, which
 * is what makes "never brighter overhead than at the horizon" structural —
 * there is no expression here that could produce one.
 *
 * `createRandom` returns values in `[0, 1)`, so `horizon` can approach
 * `skyMaxBrightness` but never reach it. The cap lives here, in the core,
 * rather than in a renderer: "the fireworks stay the whole show" has to
 * hold for every adapter, not just the one that remembered to clamp.
 */
export function buildSky(
  seed: number,
  config: AudioVisualConfig["backdrop"],
): SkyGradient {
  const random = createRandom(seed);
  const horizon = random() * config.skyMaxBrightness;
  return { horizon, zenith: random() * horizon };
}

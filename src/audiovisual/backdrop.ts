// The world backdrop's core: what the sky looks like and where its
// scenery sits, all in world space, all seeded, all pure. Grown one cycle
// at a time — see docs/06_world_backdrop.md.
//
// Nothing here chooses a character. A glyph is a rendering decision and
// belongs to an adapter; this file decides only what is where and how
// bright it is, so an ASCII grid and a future Canvas draw the same sky
// from the same seed.

import { createRandom } from "../action/random.ts";
import type { NumberRange } from "../action/config.ts";
import type { Vec3 } from "../action/types.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { CelestialBody, SkyGradient } from "./types.ts";

// World space is 100 units tall, `y` growing up — the same extent
// asciiGrid.ts maps onto rows. Duplicated deliberately rather than
// promoted into WorldConfig: that would touch Action's tested physics
// config for no behaviour change. See docs/06_world_backdrop.md.
const WORLD_TOP = 100;
const WORLD_LEFT = -50;
const WORLD_WIDTH = 100;

/** Maps the next value from `random` (in `[0, 1)`) onto `range`. Same idea
 * as spec.ts's and launch.ts's private helper of the same name — kept
 * local here too, one small helper per file rather than a shared module
 * for something this small. */
function pickInRange(random: () => number, range: NumberRange): number {
  return range.min + random() * (range.max - range.min);
}

/**
 * Somewhere in the upper sky, above `celestialMinHeight`. The half-open
 * render box is satisfied by these ranges rather than by a clamp: because
 * `random` returns `[0, 1)`, `x` lands in `[-50, 50)` and `y` in
 * `[minHeight, 100)`, so neither can hit the one coordinate rasteriseFrame
 * discards. Widen either expression to include its endpoint and a body
 * silently vanishes about one load in four billion.
 */
function bodyPosition(
  random: () => number,
  config: AudioVisualConfig["backdrop"],
): Vec3 {
  return {
    x: WORLD_LEFT + random() * WORLD_WIDTH,
    y:
      config.celestialMinHeight +
      random() * (WORLD_TOP - config.celestialMinHeight),
    z: 0,
  };
}

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

// How much of the star field a fully lit horizon washes away. At 0.8, the
// brightest sky the cap allows still keeps a fifth of its stars — a sunset
// thins the field rather than emptying it.
const STAR_WASHOUT = 0.8;

/**
 * How far this sky is toward the brightest one its config allows, in
 * `0..1`. A cap of `0` means no sunset is possible at all, so the answer
 * is `0` rather than `0 / 0` — the same class of edge as `sparkPosition`'s
 * drag of zero, and reachable the same way, since docs/06_world_backdrop.md
 * tells a reader to zero this cap to check the sky is really black.
 */
function sunsetAmount(
  sky: SkyGradient,
  config: AudioVisualConfig["backdrop"],
): number {
  if (config.skyMaxBrightness <= 0) {
    return 0;
  }
  return sky.horizon / config.skyMaxBrightness;
}

/**
 * Draws the sky's scenery from `seed`: stars, one planet and one moon, all
 * scattered above `celestialMinHeight`.
 *
 * The returned order is the **paint order** — stars, then planet, then
 * moon, later drawing over earlier. That single fact is what makes a star
 * sharing the moon's cell lose to the moon, with no overlap detection and
 * no rejection sampling anywhere in this layer.
 *
 * `sky` thins the star field as its horizon brightens, so a lit sunset
 * shows a few stars and a black night shows the lot (decision 5). Stars
 * only: the moon and the planet are scenery, not weather. With fixed
 * glyphs a star has no brightness to fade, so fewer is the only way this
 * can be expressed.
 *
 * All three kinds draw from the one generator, so changing `starCount`
 * changes how many draws precede the planet and moon and therefore moves
 * them. Nothing correlates with anything it shouldn't — which is what the
 * one-stream-per-concern convention actually guards against — but a moon
 * that jumps when you edit a star count is confusing unless you expect it.
 */
export function buildBodies(
  seed: number,
  config: AudioVisualConfig["backdrop"],
  sky: SkyGradient,
): readonly CelestialBody[] {
  const random = createRandom(seed);
  const wanted = pickInRange(random, config.starCount);
  const starCount = Math.round(
    wanted * (1 - sunsetAmount(sky, config) * STAR_WASHOUT),
  );

  const bodies: CelestialBody[] = [];
  for (let i = 0; i < starCount; i++) {
    bodies.push({ kind: "star", position: bodyPosition(random, config) });
  }
  bodies.push({ kind: "planet", position: bodyPosition(random, config) });
  bodies.push({ kind: "moon", position: bodyPosition(random, config) });
  return bodies;
}

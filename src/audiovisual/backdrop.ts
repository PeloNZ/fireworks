// The world backdrop's core: what the sky looks like and where its
// scenery sits, all in world space, all seeded, all pure. Grown one cycle
// at a time — see docs/06_world_backdrop.md.
//
// Nothing here chooses a character. A glyph is a rendering decision and
// belongs to an adapter; this file decides only what is where and how
// bright it is, so an ASCII grid and a future Canvas draw the same sky
// from the same seed.

import { createRandom, hashString } from "../action/random.ts";
import type { NumberRange } from "../action/config.ts";
import type { Vec3 } from "../action/types.ts";
import type { AudioVisualConfig } from "./config.ts";
import type {
  Backdrop,
  CelestialBody,
  GroundPoint,
  SkyGradient,
} from "./types.ts";

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
 * The ground's world height at world `x`, as a straight line between the
 * two control points either side of it. Outside the polyline the nearest
 * end's height is held rather than extrapolated, so a renderer sampling
 * slightly beyond the last point gets flat ground instead of a hill that
 * shoots off the screen.
 *
 * Walked with `for...of` rather than by index on purpose: it keeps the
 * whole function free of the `noUncheckedIndexedAccess` guards that
 * indexing a `readonly T[]` would otherwise need at every step.
 */
export function groundHeightAt(
  ground: readonly GroundPoint[],
  x: number,
): number {
  let previous: GroundPoint | undefined;
  for (const point of ground) {
    if (x < point.x) {
      if (previous === undefined) {
        return point.height; // left of the whole polyline
      }
      const t = (x - previous.x) / (point.x - previous.x);
      return previous.height + (point.height - previous.height) * t;
    }
    previous = point;
  }
  if (previous === undefined) {
    // buildGround always returns at least two points, since groundPoints
    // must be >= 2. noUncheckedIndexedAccess can't see that.
    throw new Error("unreachable: ground has no control points");
  }
  return previous.height; // at, or right of, the last point
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

/**
 * Draws the skyline from `seed`: `groundPoints` control points spread
 * evenly across the world, each at its own height. `groundPoints` must be
 * at least 2, or the spacing below divides by zero.
 *
 * The points run from `x = -50` to `x = 50` **inclusive**, which looks
 * like it breaks the half-open render box and does not: these are control
 * points to be sampled, not positions to be drawn. A polyline that stopped
 * short of `50` would leave the rightmost columns extrapolating off the end
 * of the data.
 */
export function buildGround(
  seed: number,
  config: AudioVisualConfig["backdrop"],
): readonly GroundPoint[] {
  const random = createRandom(seed);
  const spacing = WORLD_WIDTH / (config.groundPoints - 1);

  const points: GroundPoint[] = [];
  for (let i = 0; i < config.groundPoints; i++) {
    points.push({
      x: WORLD_LEFT + i * spacing,
      height: pickInRange(random, config.groundHeight),
    });
  }
  return points;
}

/**
 * Builds the whole backdrop from one page-load seed.
 *
 * Each concern draws from **its own** stream, derived by hashing a
 * distinguishing suffix — the convention `src/action/spec.ts` documents in
 * full. Calling `createRandom(seed)` three times instead would restart the
 * same sequence three times and hand the sky's horizon, the first star's
 * `x` and the first hill's height the identical first fraction,
 * correlating three values that must vary independently.
 *
 * The sky is built first because the bodies depend on it: a lit horizon
 * thins the star field.
 */
export function buildBackdrop(
  seed: number,
  config: AudioVisualConfig["backdrop"],
): Backdrop {
  const sky = buildSky(hashString(`${seed.toString()}:sky`), config);
  return {
    sky,
    bodies: buildBodies(hashString(`${seed.toString()}:bodies`), config, sky),
    ground: buildGround(hashString(`${seed.toString()}:ground`), config),
  };
}

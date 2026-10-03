import { createRandom } from "../action/random.ts";
import { parseHexColor } from "./color.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { WorldConfig } from "../action/worldConfig.ts";
import type { Firework, FireworkPattern, Vec3 } from "../action/types.ts";
import type { Sprite } from "./types.ts";

// Angular jitter, in radians, nudging each spark off its evenly-spaced
// base angle. 0 reproduces an exact even spread (the "ring" pattern);
// chrysanthemum's is wider than peony's, so the same seed and count
// scatter chrysanthemum's sparks further from the ideal ring.
const PEONY_JITTER = 0.4;
const CHRYSANTHEMUM_JITTER = 0.9;

// Willow keeps every angle inside (WILLOW_MARGIN, pi - WILLOW_MARGIN) —
// strictly the upper half of the circle — by keeping the jitter amplitude
// smaller than the margin from each end. That's what guarantees every
// willow spark points at least somewhat upward, not just "on average."
const WILLOW_MARGIN = 0.3;
const WILLOW_JITTER = 0.15;

function unitVectorAt(angle: number): Vec3 {
  return { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
}

/**
 * `count` unit directions evenly spaced around a full circle, each nudged
 * by a random jitter of `jitterAmplitude` radians. `jitterAmplitude` of
 * `0` never calls `random` at all, reproducing an exact even spread.
 */
function evenSpreadDirections(
  count: number,
  random: () => number,
  jitterAmplitude: number,
): readonly Vec3[] {
  const directions: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const base = (i / count) * Math.PI * 2;
    const jitter =
      jitterAmplitude === 0 ? 0 : (random() * 2 - 1) * jitterAmplitude;
    directions.push(unitVectorAt(base + jitter));
  }
  return directions;
}

function willowDirections(
  count: number,
  random: () => number,
): readonly Vec3[] {
  const span = Math.PI - 2 * WILLOW_MARGIN;
  const directions: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const base = WILLOW_MARGIN + ((i + 0.5) / count) * span;
    const jitter = (random() * 2 - 1) * WILLOW_JITTER;
    directions.push(unitVectorAt(base + jitter));
  }
  return directions;
}

/**
 * Picks `count` unit directions for a burst's sparks, in a flat 2D world
 * (`z` always `0`). Deterministic per `seed` — the same seed and pattern
 * always scatter the same way, so two renderers given the same
 * `FireworkSpec` draw the same-looking burst.
 */
export function sparkDirections(
  pattern: FireworkPattern,
  count: number,
  seed: number,
): readonly Vec3[] {
  const random = createRandom(seed);
  switch (pattern) {
    case "ring":
      return evenSpreadDirections(count, random, 0);
    case "peony":
      return evenSpreadDirections(count, random, PEONY_JITTER);
    case "chrysanthemum":
      return evenSpreadDirections(count, random, CHRYSANTHEMUM_JITTER);
    case "willow":
      return willowDirections(count, random);
  }
}

// The fraction of the full speed range willow's speed is confined to,
// biasing it toward the low end — a willow burst hangs rather than
// exploding outward fast.
const WILLOW_SPEED_FRACTION = 0.4;

function pickInRange(
  random: () => number,
  range: { readonly min: number; readonly max: number },
): number {
  return range.min + random() * (range.max - range.min);
}

/**
 * Picks a speed for each of a burst's `count` sparks, in world units per
 * second, outward along each spark's direction. Deterministic per `seed`,
 * same as `sparkDirections`.
 */
export function sparkSpeeds(
  pattern: FireworkPattern,
  count: number,
  seed: number,
  config: AudioVisualConfig,
): readonly number[] {
  const random = createRandom(seed);
  const { sparkSpeed } = config;
  switch (pattern) {
    case "ring": {
      const uniform = (sparkSpeed.min + sparkSpeed.max) / 2;
      return new Array<number>(count).fill(uniform);
    }
    case "peony":
    case "chrysanthemum":
      return Array.from({ length: count }, () =>
        pickInRange(random, sparkSpeed),
      );
    case "willow":
      return Array.from({ length: count }, () =>
        pickInRange(random, {
          min: sparkSpeed.min,
          max:
            sparkSpeed.min +
            (sparkSpeed.max - sparkSpeed.min) * WILLOW_SPEED_FRACTION,
        }),
      );
  }
}

/**
 * A spark's exact position at `t` milliseconds since the burst began.
 * Solved directly rather than stepped frame by frame: with `drag` at `0`,
 * the same closed-form throw formula as a thrown ball; with drag, velocity
 * decays exponentially toward a terminal velocity (`gravity / drag`)
 * instead of growing without bound, and position is the exact integral of
 * that decay. `drag` of exactly `0` would divide by zero in the general
 * formula, so it's handled as its own case rather than as a limit of it —
 * the same reason `normalise` special-cases the zero vector in
 * src/action/vector.ts.
 */
export function sparkPosition(
  origin: Vec3,
  direction: Vec3,
  speed: number,
  gravity: Vec3,
  drag: number,
  t: number,
): Vec3 {
  const seconds = t / 1000;
  const v0: Vec3 = {
    x: direction.x * speed,
    y: direction.y * speed,
    z: direction.z * speed,
  };

  if (drag === 0) {
    const half = 0.5 * seconds * seconds;
    return {
      x: origin.x + v0.x * seconds + gravity.x * half,
      y: origin.y + v0.y * seconds + gravity.y * half,
      z: origin.z + v0.z * seconds + gravity.z * half,
    };
  }

  const terminal: Vec3 = {
    x: gravity.x / drag,
    y: gravity.y / drag,
    z: gravity.z / drag,
  };
  const decay = (1 - Math.exp(-drag * seconds)) / drag;
  return {
    x: origin.x + terminal.x * seconds + (v0.x - terminal.x) * decay,
    y: origin.y + terminal.y * seconds + (v0.y - terminal.y) * decay,
    z: origin.z + terminal.z * seconds + (v0.z - terminal.z) * decay,
  };
}

/**
 * A spark's velocity at `t` milliseconds since the burst began, in world
 * units per second: the derivative of `sparkPosition` with the same
 * arguments. It leaves out the shell's own drift, which `expandBurst` adds.
 * `drag` of exactly `0` is its own case, for the same reason as in
 * `sparkPosition`.
 */
export function sparkVelocity(
  direction: Vec3,
  speed: number,
  gravity: Vec3,
  drag: number,
  t: number,
): Vec3 {
  const seconds = t / 1000;
  const v0: Vec3 = {
    x: direction.x * speed,
    y: direction.y * speed,
    z: direction.z * speed,
  };

  if (drag === 0) {
    return {
      x: v0.x + gravity.x * seconds,
      y: v0.y + gravity.y * seconds,
      z: v0.z + gravity.z * seconds,
    };
  }

  const terminal: Vec3 = {
    x: gravity.x / drag,
    y: gravity.y / drag,
    z: gravity.z / drag,
  };
  const decay = Math.exp(-drag * seconds);
  return {
    x: terminal.x + (v0.x - terminal.x) * decay,
    y: terminal.y + (v0.y - terminal.y) * decay,
    z: terminal.z + (v0.z - terminal.z) * decay,
  };
}

// Each trail point is dimmer than the last by this factor, per step back
// in time — a plain geometric falloff, not tied to any physical quantity.
const TRAIL_DECAY = 0.6;

function colorAt(colors: Firework["spec"]["colors"], index: number): string {
  const color = colors[index];
  if (color === undefined) {
    // colors is contractually non-empty and index is always in range
    // (i % colors.length) — noUncheckedIndexedAccess can't see that, so
    // it types this access as possibly undefined regardless. Same guard
    // as frame.ts's own colour access.
    throw new Error("FireworkSpec.colors must not be empty");
  }
  return color;
}

/**
 * Expands one exploding firework into its spark sprites. Sparks radiate
 * outward from wherever the shell currently is — `firework.position`,
 * which Action keeps stepping under real gravity, wind and drag through
 * "exploding", same as "launching" and "flying" — spreading further as
 * `phaseElapsedMs` grows, via `sparkPosition`'s own closed-form gravity
 * and drag. That means gravity's pull on the shell's own drift is counted
 * once by Action and once more by each spark's spread from it — a visual
 * simplification, not a physically exact composition, in the same spirit
 * as Action's constant-thrust approximation for a shell's fuel burn.
 * Gives no sprites unless `firework.phase` is `"exploding"`.
 */
export function expandBurst(
  firework: Firework,
  config: AudioVisualConfig,
  worldConfig: WorldConfig,
): readonly Sprite[] {
  if (firework.phase !== "exploding") {
    return [];
  }

  const { spec, phaseElapsedMs } = firework;
  const count = Math.round(spec.particleCount);
  const directions = sparkDirections(spec.pattern, count, spec.seed);
  const speeds = sparkSpeeds(spec.pattern, count, spec.seed, config);
  const brightness = Math.max(0, 1 - phaseElapsedMs / spec.burstDurationMs);

  const sparks: Sprite[] = [];
  for (let i = 0; i < count; i++) {
    const direction = directions[i];
    const speed = speeds[i];
    if (direction === undefined || speed === undefined) {
      // sparkDirections and sparkSpeeds both return exactly `count`
      // entries — this loop never runs past either array's length.
      throw new Error("unreachable: spark index out of range");
    }
    const color = parseHexColor(colorAt(spec.colors, i % spec.colors.length));
    sparks.push({
      kind: "spark",
      position: sparkPosition(
        firework.position,
        direction,
        speed,
        worldConfig.gravity,
        worldConfig.drag,
        phaseElapsedMs,
      ),
      size: config.sparkSize,
      color,
      brightness,
    });

    // A trail point is the same closed-form sparkPosition, evaluated a
    // little earlier — no state, nothing stored between frames. How many
    // are available grows as phaseElapsedMs does, capped at
    // config.trailMaxPoints; none exist before the first spacing interval
    // has elapsed.
    const availableTrailPoints = Math.min(
      Math.floor(phaseElapsedMs / config.trailSpacingMs),
      config.trailMaxPoints,
    );
    for (let k = 1; k <= availableTrailPoints; k++) {
      sparks.push({
        kind: "trail",
        position: sparkPosition(
          firework.position,
          direction,
          speed,
          worldConfig.gravity,
          worldConfig.drag,
          phaseElapsedMs - k * config.trailSpacingMs,
        ),
        size: config.sparkSize,
        color,
        brightness: brightness * TRAIL_DECAY ** k,
      });
    }
  }
  return sparks;
}

import { describe, expect, it } from "vitest";
import {
  expandBurst,
  sparkDirections,
  sparkPosition,
  sparkSpeeds,
} from "./sparks.ts";
import { parseHexColor } from "./color.ts";
import { defaultAudioVisualConfig } from "./config.ts";
import { defaultWorldConfig } from "../action/worldConfig.ts";
import type { Firework, FireworkSpec, Vec3 } from "../action/types.ts";

// Cycle 8 (docs/05_audio_visual_layer.md): the first piece of expanding a
// burst into sparks — which way each one flies. Every pattern places
// `count` unit vectors around a circle; what differs is how much random
// jitter nudges each one off its evenly-spaced base angle, drawn from
// `createRandom(seed)` so the same seed always gives the same burst shape.

function angleOf(v: Vec3): number {
  return Math.atan2(v.y, v.x);
}

// The shortest signed distance between two angles, wrapping through the
// -pi/pi boundary correctly — a plain subtraction breaks the moment a
// base angle passes pi.
function angularDeviation(actual: number, base: number): number {
  const diff = actual - base;
  return Math.abs(((diff + Math.PI) % (Math.PI * 2)) - Math.PI);
}

function maxDeviationFromEvenSpread(directions: readonly Vec3[]): number {
  const deviations = directions.map((v, i) => {
    const base = (i / directions.length) * Math.PI * 2;
    return angularDeviation(angleOf(v), base);
  });
  return Math.max(...deviations);
}

describe("sparkDirections", () => {
  it("returns count unit vectors with z always 0", () => {
    const directions = sparkDirections("peony", 7, 1);

    expect(directions).toHaveLength(7);
    for (const v of directions) {
      expect(v.z).toBe(0);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    }
  });

  it("returns the same directions for the same seed on repeat calls", () => {
    const first = sparkDirections("peony", 6, 42);
    const second = sparkDirections("peony", 6, 42);

    expect(second).toEqual(first);
  });

  it("ring spaces angles evenly with no jitter, ignoring the seed entirely", () => {
    const withOneSeed = sparkDirections("ring", 4, 1);
    const withAnotherSeed = sparkDirections("ring", 4, 999);

    expect(withOneSeed).toEqual(withAnotherSeed);
    expect(withOneSeed[0]?.x).toBeCloseTo(1);
    expect(withOneSeed[0]?.y).toBeCloseTo(0);
    expect(withOneSeed[1]?.x).toBeCloseTo(0);
    expect(withOneSeed[1]?.y).toBeCloseTo(1);
    expect(withOneSeed[2]?.x).toBeCloseTo(-1);
    expect(withOneSeed[2]?.y).toBeCloseTo(0);
    expect(withOneSeed[3]?.x).toBeCloseTo(0);
    expect(withOneSeed[3]?.y).toBeCloseTo(-1);
  });

  it("peony jitters each angle so two seeds produce different bursts", () => {
    const withOneSeed = sparkDirections("peony", 8, 1);
    const withAnotherSeed = sparkDirections("peony", 8, 2);

    expect(withOneSeed).not.toEqual(withAnotherSeed);
  });

  it("willow biases every direction toward the upper half", () => {
    const directions = sparkDirections("willow", 9, 3);

    for (const v of directions) {
      expect(v.y).toBeGreaterThan(0);
    }
  });

  it("chrysanthemum jitters wider than peony, given the same seed", () => {
    const peony = sparkDirections("peony", 10, 7);
    const chrysanthemum = sparkDirections("chrysanthemum", 10, 7);

    expect(maxDeviationFromEvenSpread(chrysanthemum)).toBeGreaterThan(
      maxDeviationFromEvenSpread(peony),
    );
  });
});

// Cycle 9: how fast each spark flies. ring is uniform, so every spark
// reaches the same radius and traces one expanding circle; peony and
// chrysanthemum vary across the full range, so they fill a disc instead;
// willow sits toward the low end, so a willow burst hangs rather than
// exploding outward fast.

// A deliberately unusual range, not the default, so a hardcoded speed
// can't pass.
const speedConfig = {
  ...defaultAudioVisualConfig,
  sparkSpeed: { min: 12, max: 19 },
};

describe("sparkSpeeds", () => {
  it("returns every value inside config.sparkSpeed", () => {
    const speeds = sparkSpeeds("peony", 20, 1, speedConfig);

    for (const speed of speeds) {
      expect(speed).toBeGreaterThanOrEqual(speedConfig.sparkSpeed.min);
      expect(speed).toBeLessThanOrEqual(speedConfig.sparkSpeed.max);
    }
  });

  it("ring returns a uniform speed for every spark, ignoring the seed", () => {
    const withOneSeed = sparkSpeeds("ring", 5, 1, speedConfig);
    const withAnotherSeed = sparkSpeeds("ring", 5, 999, speedConfig);

    expect(withOneSeed).toEqual(withAnotherSeed);
    const [first] = withOneSeed;
    for (const speed of withOneSeed) {
      expect(speed).toBe(first);
    }
  });

  it("peony varies speed across the range, using the seed", () => {
    const withOneSeed = sparkSpeeds("peony", 8, 1, speedConfig);
    const withAnotherSeed = sparkSpeeds("peony", 8, 2, speedConfig);

    expect(withOneSeed).not.toEqual(withAnotherSeed);
  });

  it("willow sits toward the low end of the range", () => {
    const speeds = sparkSpeeds("willow", 10, 5, speedConfig);
    const midpoint =
      (speedConfig.sparkSpeed.min + speedConfig.sparkSpeed.max) / 2;

    for (const speed of speeds) {
      expect(speed).toBeLessThan(midpoint);
    }
  });
});

// Cycle 10: a spark's exact position under gravity alone (no drag) —
// the same closed-form throw formula as a thrown ball. t is milliseconds
// since the burst began (Firework.phaseElapsedMs), converted to seconds
// internally so it matches gravity and speed's per-second units.

const origin: Vec3 = { x: 0, y: 0, z: 0 };

describe("sparkPosition", () => {
  it("returns exactly origin at t=0", () => {
    const position = sparkPosition(
      origin,
      { x: 1, y: 0, z: 0 },
      10,
      { x: 0, y: -18, z: 0 },
      0,
      0,
    );

    expect(position).toEqual(origin);
  });

  it("tracks the initial direction closely at a small t, before gravity's t-squared term has caught up", () => {
    const position = sparkPosition(
      origin,
      { x: 1, y: 0, z: 0 },
      100,
      { x: 0, y: -18, z: 0 },
      0,
      1, // 1ms = 0.001s
    );

    expect(position.x).toBeCloseTo(0.1);
    expect(position.y).toBeCloseTo(0);
    expect(position.z).toBe(0);
  });

  it("doubling gravity doubles the downward sag at a fixed t", () => {
    const direction: Vec3 = { x: 1, y: 0, z: 0 };
    const sagWithOneGravity = -sparkPosition(
      origin,
      direction,
      10,
      { x: 0, y: -18, z: 0 },
      0,
      1000,
    ).y;
    const sagWithDoubledGravity = -sparkPosition(
      origin,
      direction,
      10,
      { x: 0, y: -36, z: 0 },
      0,
      1000,
    ).y;

    expect(sagWithDoubledGravity).toBeCloseTo(2 * sagWithOneGravity);
  });

  // Cycle 11: with drag, velocity decays exponentially toward a terminal
  // velocity (gravity / drag) instead of growing without bound. Position
  // is the exact integral of that decay, not another Euler step.
  it("matches the closed-form drag formula at a hand-computed point", () => {
    const position = sparkPosition(
      origin,
      { x: 1, y: 0, z: 0 },
      10,
      { x: 0, y: -18, z: 0 },
      2,
      500, // 500ms = 0.5s
    );

    // k=2, t=0.5s: decay = (1 - e^-1) / 2 ≈ 0.3160603
    // x: v_term.x=0, so x = 10 * decay
    // y: v_term.y=-9, so y = -9*0.5 + (0-(-9))*decay
    expect(position.x).toBeCloseTo(3.1606028, 5);
    expect(position.y).toBeCloseTo(-1.6554575, 5);
    expect(position.z).toBe(0);
  });

  it("falls back to the gravity-only formula when drag is exactly 0, instead of dividing by zero", () => {
    const position = sparkPosition(
      origin,
      { x: 1, y: 0, z: 0 },
      10,
      { x: 0, y: -18, z: 0 },
      0,
      1000,
    );

    expect(position.x).toBeCloseTo(10);
    expect(position.y).toBeCloseTo(-9);
    expect(position.z).toBe(0);
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
  });
});

// Cycle 12: turning a burst into sprites, tying sparkDirections,
// sparkSpeeds and sparkPosition together. Sparks radiate outward from
// wherever the shell currently is (firework.position — Action keeps
// stepping it under real physics through "exploding", same as
// "launching" and "flying"), spreading further as phaseElapsedMs grows.

function fireworkSpec(overrides: Partial<FireworkSpec> = {}): FireworkSpec {
  return {
    id: "KeyA:1000",
    launchedAt: 1000,
    origin: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 10, z: 0 },
    thrust: 0,
    fuelMs: 500,
    fuseMs: 900,
    pattern: "peony",
    colors: ["#ff3b30", "#00c2ff"],
    particleCount: 60,
    burstDurationMs: 300,
    sound: { pitch: 440, timbre: "soft" },
    seed: 1,
    ...overrides,
  };
}

function firework(overrides: Partial<Firework> = {}): Firework {
  const spec = overrides.spec ?? fireworkSpec();
  return {
    spec,
    phase: "exploding",
    position: { x: 5, y: 40, z: 0 },
    previousPosition: { x: 5, y: 40, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    fuelRemainingMs: 0,
    fuseRemainingMs: 0,
    phaseElapsedMs: 0,
    ...overrides,
  };
}

describe("expandBurst", () => {
  it("returns round(spec.particleCount) sprites while exploding", () => {
    const entity = firework({ spec: fireworkSpec({ particleCount: 7.6 }) });

    const sparks = expandBurst(
      entity,
      defaultAudioVisualConfig,
      defaultWorldConfig,
    );

    expect(sparks).toHaveLength(8);
  });

  it("positions each spark via sparkPosition, from the shell's current position", () => {
    const entity = firework({ phaseElapsedMs: 120 });
    const count = Math.round(entity.spec.particleCount);
    const directions = sparkDirections(
      entity.spec.pattern,
      count,
      entity.spec.seed,
    );
    const speeds = sparkSpeeds(
      entity.spec.pattern,
      count,
      entity.spec.seed,
      defaultAudioVisualConfig,
    );
    const [direction] = directions;
    const [speed] = speeds;
    if (direction === undefined || speed === undefined) {
      throw new Error("test fixture produced no sparks");
    }
    const expected = sparkPosition(
      entity.position,
      direction,
      speed,
      defaultWorldConfig.gravity,
      defaultWorldConfig.drag,
      entity.phaseElapsedMs,
    );

    const sparks = expandBurst(
      entity,
      defaultAudioVisualConfig,
      defaultWorldConfig,
    );

    expect(sparks[0]?.position).toEqual(expected);
  });

  it("cycles spark colours through spec.colors", () => {
    const entity = firework({
      spec: fireworkSpec({
        particleCount: 5,
        colors: ["#ff3b30", "#00c2ff"],
      }),
    });

    const sparks = expandBurst(
      entity,
      defaultAudioVisualConfig,
      defaultWorldConfig,
    );

    expect(sparks.map((s) => s.color)).toEqual([
      parseHexColor("#ff3b30"),
      parseHexColor("#00c2ff"),
      parseHexColor("#ff3b30"),
      parseHexColor("#00c2ff"),
      parseHexColor("#ff3b30"),
    ]);
  });

  it("brightness falls linearly to 0 as phaseElapsedMs approaches burstDurationMs", () => {
    const spec = fireworkSpec({ particleCount: 3, burstDurationMs: 300 });

    const atStart = expandBurst(
      firework({ spec, phaseElapsedMs: 0 }),
      defaultAudioVisualConfig,
      defaultWorldConfig,
    );
    const atHalf = expandBurst(
      firework({ spec, phaseElapsedMs: 150 }),
      defaultAudioVisualConfig,
      defaultWorldConfig,
    );
    const atEnd = expandBurst(
      firework({ spec, phaseElapsedMs: 300 }),
      defaultAudioVisualConfig,
      defaultWorldConfig,
    );

    expect(atStart[0]?.brightness).toBeCloseTo(1);
    expect(atHalf[0]?.brightness).toBeCloseTo(0.5);
    expect(atEnd[0]?.brightness).toBeCloseTo(0);
  });

  it.each(["armed", "launching", "flying", "finished"] as const)(
    "gives no sparks while phase is %s",
    (phase) => {
      const entity = firework({ phase });

      const sparks = expandBurst(
        entity,
        defaultAudioVisualConfig,
        defaultWorldConfig,
      );

      expect(sparks).toEqual([]);
    },
  );
});

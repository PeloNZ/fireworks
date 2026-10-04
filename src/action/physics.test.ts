import { describe, expect, it } from "vitest";
import { stepPhysics } from "./physics.ts";
import { defaultSettings } from "../config.ts";
import { magnitude } from "./vector.ts";
import type { Firework, FireworkSpec } from "./types.ts";
import type { WorldConfig } from "./worldConfig.ts";

// Cycle 11 (docs/04_plan_action_layer.md): stepPhysics is the physics
// core — semi-implicit Euler under gravity, wind, drag and thrust. Each
// force is tested in isolation by zeroing out the others, so a failure
// points at one specific term.

const ZERO_WORLD: WorldConfig = {
  gravity: { x: 0, y: 0, z: 0 },
  wind: { x: 0, y: 0, z: 0 },
  drag: 0,
  stepMs: defaultSettings.world.stepMs,
};

function fireworkSpec(overrides: Partial<FireworkSpec> = {}): FireworkSpec {
  return {
    id: "KeyA:1000",
    launchedAt: 1000,
    origin: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 10, z: 0 },
    thrust: 0,
    fuelMs: 0,
    fuseMs: 999999,
    pattern: "peony",
    colors: ["#ff0000"],
    particleCount: 60,
    burstDurationMs: 800,
    sound: { pitch: 440, timbre: "soft" },
    seed: 1,
    ...overrides,
  };
}

function firework(overrides: Partial<Firework> = {}): Firework {
  const spec = overrides.spec ?? fireworkSpec();
  return {
    spec,
    phase: "flying",
    position: spec.origin,
    previousPosition: spec.origin,
    velocity: spec.velocity,
    fuelRemainingMs: spec.fuelMs,
    fuseRemainingMs: spec.fuseMs,
    phaseElapsedMs: 0,
    ...overrides,
  };
}

describe("stepPhysics", () => {
  it("advances position by exactly velocity * dt with every force zeroed", () => {
    const initial = firework({
      spec: fireworkSpec({ velocity: { x: 5, y: 2, z: 0 } }),
    });

    const result = stepPhysics(initial, ZERO_WORLD, 100);

    // dt = 0.1s, velocity unchanged (no acceleration), so displacement is
    // exactly velocity * dt.
    expect(result.position.x).toBeCloseTo(0.5);
    expect(result.position.y).toBeCloseTo(0.2);
    expect(result.velocity).toEqual({ x: 5, y: 2, z: 0 });
  });

  it("rises, crosses velocity.y = 0 exactly once, and returns near launch height at near launch speed under gravity alone", () => {
    const gravity = { x: 0, y: -100, z: 0 };
    const world: WorldConfig = { ...ZERO_WORLD, gravity };
    const launchSpeed = 10;
    let current = firework({
      spec: fireworkSpec({ velocity: { x: 0, y: launchSpeed, z: 0 } }),
    });

    let signCrossings = 0;
    let previousVy = current.velocity.y;
    let rose = false;
    let landed: Firework | null = null;

    for (let i = 0; i < 1000 && !landed; i++) {
      current = stepPhysics(current, world, 1);
      if (current.position.y > 0) rose = true;
      if (Math.sign(current.velocity.y) !== Math.sign(previousVy)) {
        signCrossings++;
      }
      previousVy = current.velocity.y;
      if (rose && current.position.y <= 0) {
        landed = current;
      }
    }

    expect(rose).toBe(true);
    expect(signCrossings).toBe(1);
    expect(landed).not.toBeNull();
    expect(landed?.position.y).toBeCloseTo(0, 1);
    expect(magnitude(landed?.velocity ?? { x: 0, y: 0, z: 0 })).toBeCloseTo(
      launchSpeed,
      1,
    );
  });

  it("moves an object sideways under wind, doubling wind doubles the sideways offset over the same span", () => {
    const stationary = firework({
      spec: fireworkSpec({ velocity: { x: 0, y: 0, z: 0 } }),
    });

    let a = stationary;
    let b = stationary;
    const worldA: WorldConfig = { ...ZERO_WORLD, wind: { x: 3, y: 0, z: 0 } };
    const worldB: WorldConfig = { ...ZERO_WORLD, wind: { x: 6, y: 0, z: 0 } };
    for (let i = 0; i < 50; i++) {
      a = stepPhysics(a, worldA, 10);
      b = stepPhysics(b, worldB, 10);
    }

    expect(a.position.x).toBeGreaterThan(0);
    expect(b.position.x).toBeCloseTo(a.position.x * 2, 5);
  });

  it("reduces speed every step under drag and never reverses direction", () => {
    const world: WorldConfig = { ...ZERO_WORLD, drag: 5 };
    let current = firework({
      spec: fireworkSpec({ velocity: { x: 10, y: 0, z: 0 } }),
    });
    let previousSpeed = magnitude(current.velocity);

    for (let i = 0; i < 30; i++) {
      current = stepPhysics(current, world, 10);
      const speed = magnitude(current.velocity);
      expect(speed).toBeLessThan(previousSpeed);
      expect(current.velocity.x).toBeGreaterThanOrEqual(0);
      previousSpeed = speed;
    }
  });

  it("applies thrust while fuel remains and stops once it reaches zero, staying in flying either way", () => {
    const fueled = firework({
      spec: fireworkSpec({ velocity: { x: 0, y: 1, z: 0 }, thrust: 50 }),
      fuelRemainingMs: 100,
      phase: "flying",
    });
    const outOfFuel = firework({
      spec: fireworkSpec({ velocity: { x: 0, y: 1, z: 0 }, thrust: 50 }),
      fuelRemainingMs: 0,
      phase: "flying",
    });

    const fueledResult = stepPhysics(fueled, ZERO_WORLD, 10);
    const outOfFuelResult = stepPhysics(outOfFuel, ZERO_WORLD, 10);

    expect(fueledResult.velocity.y).toBeGreaterThan(fueled.velocity.y);
    expect(outOfFuelResult.velocity).toEqual(outOfFuel.velocity);
    expect(fueledResult.phase).toBe("flying");
    expect(outOfFuelResult.phase).toBe("flying");
  });

  it("sets previousPosition to the position before the step", () => {
    const initial = firework({ position: { x: 3, y: 4, z: 0 } });

    const result = stepPhysics(initial, ZERO_WORLD, 10);

    expect(result.previousPosition).toEqual({ x: 3, y: 4, z: 0 });
  });

  it("gives identical results stepping the same firework twice from the same start", () => {
    const initial = firework({
      spec: fireworkSpec({ velocity: { x: 4, y: 6, z: 0 }, thrust: 20 }),
      fuelRemainingMs: 200,
    });

    const a = stepPhysics(initial, defaultSettings.world, 8);
    const b = stepPhysics(initial, defaultSettings.world, 8);

    expect(a).toEqual(b);
  });
});

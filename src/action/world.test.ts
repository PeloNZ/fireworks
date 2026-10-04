import { describe, expect, it } from "vitest";
import { defaultSettings } from "../config.ts";
import { createFirework, createWorld } from "./world.ts";
import type { Firework, FireworkSpec } from "./types.ts";
import type { WorldConfig } from "./worldConfig.ts";

// Cycle 10 (docs/04_plan_action_layer.md): createFirework builds the live
// object from a spec. It's a snapshot at t=0 — before any physics or phase
// step has run.

function spec(overrides: Partial<FireworkSpec> = {}): FireworkSpec {
  return {
    id: "KeyA:1000",
    launchedAt: 1000,
    origin: { x: 3, y: 4, z: 0 },
    velocity: { x: 1, y: 2, z: 0 },
    thrust: 30,
    fuelMs: 500,
    fuseMs: 900,
    pattern: "peony",
    colors: ["#ff0000"],
    particleCount: 60,
    burstDurationMs: 800,
    sound: { pitch: 440, timbre: "soft" },
    seed: 12345,
    ...overrides,
  };
}

describe("createFirework", () => {
  it("starts in the armed phase", () => {
    expect(createFirework(spec()).phase).toBe("armed");
  });

  it("sets position and previousPosition to spec.origin", () => {
    const firework = createFirework(spec({ origin: { x: 5, y: 6, z: 0 } }));

    expect(firework.position).toEqual({ x: 5, y: 6, z: 0 });
    expect(firework.previousPosition).toEqual({ x: 5, y: 6, z: 0 });
  });

  it("sets velocity to spec.velocity", () => {
    const firework = createFirework(spec({ velocity: { x: 7, y: 8, z: 0 } }));

    expect(firework.velocity).toEqual({ x: 7, y: 8, z: 0 });
  });

  it("sets fuelRemainingMs and fuseRemainingMs to the spec's fuelMs and fuseMs", () => {
    const firework = createFirework(spec({ fuelMs: 321, fuseMs: 654 }));

    expect(firework.fuelRemainingMs).toBe(321);
    expect(firework.fuseRemainingMs).toBe(654);
  });

  it("starts with phaseElapsedMs at 0", () => {
    expect(createFirework(spec()).phaseElapsedMs).toBe(0);
  });

  it("keeps a reference to the spec it was built from", () => {
    const s = spec();

    expect(createFirework(s).spec).toBe(s);
  });
});

// Cycle 13 (docs/04_plan_action_layer.md): createWorld wires stepPhysics
// and stepPhase together into a real stepping loop, on a fixed timestep —
// see "Fixed timestep" for why the loop accumulates real elapsed time
// rather than integrating with a variable dt.

const STEP_MS = 10;
const worldConfig: WorldConfig = { ...defaultSettings.world, stepMs: STEP_MS };
// A long launch/fuse by default, so phase stays "armed" and nothing resets
// phaseElapsedMs unless a test deliberately shortens one of these.
const actionConfig = { ...defaultSettings.action, launchDurationMs: 1_000_000 };

function stillSpec(overrides: Partial<FireworkSpec> = {}): FireworkSpec {
  return spec({ fuseMs: 1_000_000, ...overrides });
}

describe("createWorld", () => {
  it("adds an entity on spawn", () => {
    const world = createWorld({ worldConfig, config: actionConfig });

    world.spawn(stillSpec());

    expect(world.entities()).toHaveLength(1);
    expect(world.entities()[0]?.phase).toBe("armed");
  });

  it("runs floor(elapsed / stepMs) fixed steps and keeps the remainder", () => {
    const world = createWorld({ worldConfig, config: actionConfig });
    world.spawn(stillSpec());

    // Neither call alone reaches stepMs (10), but together they do — this
    // should run exactly one fixed step, not two, and keep the 6ms
    // remainder for next time.
    world.step(8);
    world.step(8);

    expect(world.entities()[0]?.phaseElapsedMs).toBe(STEP_MS);
    expect(world.alpha()).toBeCloseTo(0.6);
  });

  it("returns a copy from entities(), so mutating the result never touches stored state", () => {
    const world = createWorld({ worldConfig, config: actionConfig });
    world.spawn(stillSpec());

    const first = world.entities();
    // A type assertion, not @ts-expect-error: `entities()` returns
    // `readonly Firework[]` to stop ordinary callers mutating it, but this
    // test needs to mutate it anyway, to prove that doing so doesn't reach
    // the world's own internal array.
    (first as Firework[]).push(...first);

    expect(world.entities()).toHaveLength(1);
  });

  it("gives one entities() snapshot of a firework as finished before removing it", () => {
    // fuse ends the flight after exactly one tick, burst ends after one
    // more — both tuned to STEP_MS so the transitions land on tick
    // boundaries exactly. A caller's usual render loop is step() then
    // entities() — rule 5 promises that loop sees "finished" for one
    // iteration before the entity disappears, not zero.
    const world = createWorld({ worldConfig, config: actionConfig });
    world.spawn(stillSpec({ fuseMs: STEP_MS, burstDurationMs: STEP_MS }));

    world.step(STEP_MS);
    expect(world.entities()[0]?.phase).toBe("exploding");

    world.step(STEP_MS);
    expect(world.entities()[0]?.phase).toBe("finished");

    world.step(STEP_MS);
    expect(world.entities()).toHaveLength(0);
  });

  it("returns alpha between 0 and 1, reflecting the leftover fraction of a step", () => {
    const world = createWorld({ worldConfig, config: actionConfig });
    world.spawn(stillSpec());

    world.step(23); // 2 full steps (20ms) + 3ms remainder

    expect(world.alpha()).toBeCloseTo(0.3);
  });

  it("does not apply gravity, wind or drag while a firework is still armed", () => {
    const worldWithGravity: WorldConfig = {
      ...worldConfig,
      gravity: { x: 0, y: -1000, z: 0 },
    };
    const world = createWorld({
      worldConfig: worldWithGravity,
      config: actionConfig,
    });
    world.spawn(stillSpec({ velocity: { x: 0, y: 0, z: 0 } }));

    world.step(STEP_MS);

    expect(world.entities()[0]?.position).toEqual({ x: 3, y: 4, z: 0 });
  });

  it("produces identical states from two fresh worlds given the same spawns and elapsed values", () => {
    function run(): unknown {
      const world = createWorld({ worldConfig, config: actionConfig });
      world.spawn(stillSpec());
      world.spawn(
        stillSpec({ id: "KeyB:2000", origin: { x: -3, y: 0, z: 0 } }),
      );
      for (const elapsed of [7, 15, 2, 30]) {
        world.step(elapsed);
      }
      return { entities: world.entities(), alpha: world.alpha() };
    }

    expect(run()).toEqual(run());
  });
});

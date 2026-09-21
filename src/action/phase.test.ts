import { describe, expect, it } from "vitest";
import { defaultActionConfig } from "./config.ts";
import { stepPhase } from "./phase.ts";
import type { Firework, FireworkSpec } from "./types.ts";

// Cycle 12 (docs/04_plan_action_layer.md): stepPhase owns the state
// machine and, per cycle 11's doc-sync note, the fuel/fuse countdown that
// stepPhysics only reads. The fuse is checked independently of every other
// timer — it can end "launching" or "flying" early, which is the whole
// point of the fuse being a separate field from fuel.

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
    colors: ["#ff0000"],
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
    phase: "armed",
    position: spec.origin,
    previousPosition: spec.origin,
    velocity: spec.velocity,
    fuelRemainingMs: spec.fuelMs,
    fuseRemainingMs: spec.fuseMs,
    phaseElapsedMs: 0,
    ...overrides,
  };
}

const config = { ...defaultActionConfig, launchDurationMs: 200 };

describe("stepPhase", () => {
  it("moves from armed to launching once half of launchDurationMs has elapsed", () => {
    let current = firework({
      spec: fireworkSpec({ fuseMs: 999999 }),
      phase: "armed",
    });

    current = stepPhase(current, config, 99);
    expect(current.phase).toBe("armed");

    current = stepPhase(current, config, 2);
    expect(current.phase).toBe("launching");
  });

  it("moves from launching to flying once the second half of launchDurationMs has elapsed", () => {
    let current = firework({
      spec: fireworkSpec({ fuseMs: 999999 }),
      phase: "launching",
      phaseElapsedMs: 0,
    });

    current = stepPhase(current, config, 99);
    expect(current.phase).toBe("launching");

    current = stepPhase(current, config, 2);
    expect(current.phase).toBe("flying");
  });

  it("moves from flying to exploding once fuseRemainingMs reaches zero", () => {
    let current = firework({
      spec: fireworkSpec({ fuseMs: 100 }),
      phase: "flying",
      fuseRemainingMs: 100,
    });

    current = stepPhase(current, config, 99);
    expect(current.phase).toBe("flying");

    current = stepPhase(current, config, 2);
    expect(current.phase).toBe("exploding");
  });

  it("moves from exploding to finished once spec.burstDurationMs has elapsed", () => {
    let current = firework({
      spec: fireworkSpec({ burstDurationMs: 100 }),
      phase: "exploding",
      phaseElapsedMs: 0,
    });

    current = stepPhase(current, config, 99);
    expect(current.phase).toBe("exploding");

    current = stepPhase(current, config, 2);
    expect(current.phase).toBe("finished");
  });

  it("bursts during launching when the fuse is shorter than launchDurationMs, proving the fuse is independent of the launch timer", () => {
    // launchDurationMs is 200 (config above), so armed -> launching happens
    // at t=100. A fuse of 150 reaches zero at t=150 — 50ms into launching,
    // well short of launching's own t=200 exit into flying.
    let current = firework({
      spec: fireworkSpec({ fuseMs: 150 }),
      phase: "armed",
      fuseRemainingMs: 150,
    });

    for (let i = 0; i < 15; i++) {
      current = stepPhase(current, config, 10);
    }

    expect(current.phase).toBe("exploding");
  });

  it("does not change phase when fuel reaches zero", () => {
    let current = firework({
      spec: fireworkSpec({ fuelMs: 50, fuseMs: 999999 }),
      phase: "flying",
      fuelRemainingMs: 50,
    });

    current = stepPhase(current, config, 60);

    expect(current.fuelRemainingMs).toBe(0);
    expect(current.phase).toBe("flying");
  });

  it("resets phaseElapsedMs to 0 on every transition", () => {
    let current = firework({
      spec: fireworkSpec({ fuseMs: 999999 }),
      phase: "armed",
      phaseElapsedMs: 90,
    });

    current = stepPhase(current, config, 15); // crosses the 100ms threshold

    expect(current.phase).toBe("launching");
    expect(current.phaseElapsedMs).toBe(0);
  });

  it("counts fuelRemainingMs and fuseRemainingMs down by dtMs, clamped at 0", () => {
    const current = stepPhase(
      firework({
        spec: fireworkSpec({ fuelMs: 500, fuseMs: 900 }),
        fuelRemainingMs: 500,
        fuseRemainingMs: 900,
      }),
      config,
      50,
    );

    expect(current.fuelRemainingMs).toBe(450);
    expect(current.fuseRemainingMs).toBe(850);
  });

  it("never lets fuelRemainingMs or fuseRemainingMs go below 0", () => {
    const current = stepPhase(
      firework({
        spec: fireworkSpec({ fuelMs: 10, fuseMs: 999999 }),
        fuelRemainingMs: 10,
        fuseRemainingMs: 999999,
      }),
      config,
      1000,
    );

    expect(current.fuelRemainingMs).toBe(0);
  });
});

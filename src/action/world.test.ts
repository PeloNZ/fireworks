import { describe, expect, it } from "vitest";
import { createFirework } from "./world.ts";
import type { FireworkSpec } from "./types.ts";

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

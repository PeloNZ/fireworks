import { describe, expect, it } from "vitest";
import { formatFirework } from "./format.ts";
import type { Firework, FireworkSpec } from "../types.ts";

// Cycle 16 (docs/04_plan_action_layer.md): formatFirework turns a
// Firework into one line of text. Same split as the Control layer's
// formatControlEvent — this stays pure, createSpecConsoleSink (cycle 17)
// is the one line that actually calls console.debug.

function fireworkSpec(overrides: Partial<FireworkSpec> = {}): FireworkSpec {
  return {
    id: "KeyA:1000",
    launchedAt: 1000,
    origin: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 10, z: 0 },
    thrust: 30,
    fuelMs: 500,
    fuseMs: 900,
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
    position: { x: 1.2345, y: 6.789, z: 0 },
    previousPosition: spec.origin,
    velocity: spec.velocity,
    fuelRemainingMs: spec.fuelMs,
    fuseRemainingMs: spec.fuseMs,
    phaseElapsedMs: 0,
    ...overrides,
  };
}

describe("formatFirework", () => {
  it("formats a firework as one exact line", () => {
    expect(formatFirework(firework())).toBe(
      "KeyA:1000 phase=flying pos=(1.23,6.79,0.00) pattern=peony",
    );
  });

  it("reflects different field values, not a hardcoded line", () => {
    const result = formatFirework(
      firework({
        spec: fireworkSpec({ id: "KeyB:2000", pattern: "willow" }),
        phase: "exploding",
        position: { x: -10, y: 42, z: 0 },
      }),
    );

    expect(result).toBe(
      "KeyB:2000 phase=exploding pos=(-10.00,42.00,0.00) pattern=willow",
    );
  });
});

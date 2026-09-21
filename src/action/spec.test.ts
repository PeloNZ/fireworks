import { describe, expect, it } from "vitest";
import { defaultActionConfig } from "./config.ts";
import { buildFireworkSpec } from "./spec.ts";
import type { ControlSignal } from "../control/types.ts";

// Cycle 9 (docs/04_plan_action_layer.md): buildFireworkSpec assembles the
// full recipe from the pieces built in cycles 1-8. It's the first cycle
// that produces a FireworkSpec, and the first place all those pieces meet.

function signal(overrides: Partial<ControlSignal> = {}): ControlSignal {
  return {
    id: "KeyA",
    shift: false,
    timestamp: 1000,
    intensity: 1,
    source: "keyboard",
    ...overrides,
  };
}

describe("buildFireworkSpec", () => {
  it("sets origin to config.launchOrigin", () => {
    const config = {
      ...defaultActionConfig,
      launchOrigin: { x: 7, y: 8, z: 0 },
    };

    const spec = buildFireworkSpec(signal(), config);

    expect(spec.origin).toEqual({ x: 7, y: 8, z: 0 });
  });

  it("sets launchedAt to signal.timestamp", () => {
    const spec = buildFireworkSpec(
      signal({ timestamp: 4242 }),
      defaultActionConfig,
    );

    expect(spec.launchedAt).toBe(4242);
  });

  it("gives a deterministic id that differs between two presses of the same key at different times", () => {
    const a = buildFireworkSpec(
      signal({ id: "KeyA", timestamp: 1000 }),
      defaultActionConfig,
    );
    const b = buildFireworkSpec(
      signal({ id: "KeyA", timestamp: 2000 }),
      defaultActionConfig,
    );

    expect(a.id).not.toBe(b.id);
    expect(
      buildFireworkSpec(
        signal({ id: "KeyA", timestamp: 1000 }),
        defaultActionConfig,
      ).id,
    ).toBe(a.id);
  });

  it("keeps thrust, fuelMs and fuseMs inside their configured ranges", () => {
    const config = {
      ...defaultActionConfig,
      thrust: { min: 111, max: 112 },
      fuelMs: { min: 222, max: 223 },
      fuseMs: { min: 333, max: 334 },
    };

    const spec = buildFireworkSpec(signal(), config);

    expect(spec.thrust).toBeGreaterThanOrEqual(111);
    expect(spec.thrust).toBeLessThanOrEqual(112);
    expect(spec.fuelMs).toBeGreaterThanOrEqual(222);
    expect(spec.fuelMs).toBeLessThanOrEqual(223);
    expect(spec.fuseMs).toBeGreaterThanOrEqual(333);
    expect(spec.fuseMs).toBeLessThanOrEqual(334);
  });

  it("keeps particleCount and burstDurationMs inside their configured ranges", () => {
    const config = {
      ...defaultActionConfig,
      particleCount: { min: 999, max: 1000 },
      burstDurationMs: { min: 5000, max: 5001 },
    };

    const spec = buildFireworkSpec(signal(), config);

    expect(spec.particleCount).toBeGreaterThanOrEqual(999);
    expect(spec.particleCount).toBeLessThanOrEqual(1000);
    expect(spec.burstDurationMs).toBeGreaterThanOrEqual(5000);
    expect(spec.burstDurationMs).toBeLessThanOrEqual(5001);
  });

  it("produces a deep-equal spec when fed the same signal twice", () => {
    const a = buildFireworkSpec(signal(), defaultActionConfig);
    const b = buildFireworkSpec(signal(), defaultActionConfig);

    expect(a).toEqual(b);
  });

  it("assembles pattern, colors and sound from the trait pickers", () => {
    const spec = buildFireworkSpec(signal(), defaultActionConfig);

    expect(defaultActionConfig.patterns).toContain(spec.pattern);
    expect(spec.colors).toHaveLength(defaultActionConfig.paletteSize);
    expect(defaultActionConfig.sound.timbres).toContain(spec.sound.timbre);
  });
});

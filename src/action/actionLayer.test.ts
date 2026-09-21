import { describe, expect, it } from "vitest";
import { defaultActionConfig } from "./config.ts";
import { resolveAction } from "./actionLayer.ts";
import { buildFireworkSpec } from "./spec.ts";
import type { ControlEvent, ControlSignal } from "../control/types.ts";

// Cycle 14 (docs/04_plan_action_layer.md): resolveAction is the seam
// decision 4 reserves — a chord or sequence-triggered special firework
// later appends to the returned array, without this signature changing.

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

describe("resolveAction", () => {
  it("returns exactly one spec for a single event, deep-equal to buildFireworkSpec's own result", () => {
    const s = signal();
    const event: ControlEvent = { kind: "single", signal: s };

    const specs = resolveAction(event, defaultActionConfig);

    expect(specs).toEqual([buildFireworkSpec(s, defaultActionConfig)]);
  });

  it("returns an array", () => {
    const event: ControlEvent = { kind: "single", signal: signal() };

    expect(Array.isArray(resolveAction(event, defaultActionConfig))).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../config.ts";
import { createActionLayer, resolveAction } from "./actionLayer.ts";
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

    const specs = resolveAction(event, defaultSettings.action);

    expect(specs).toEqual([buildFireworkSpec(s, defaultSettings.action)]);
  });

  it("returns an array", () => {
    const event: ControlEvent = { kind: "single", signal: signal() };

    expect(Array.isArray(resolveAction(event, defaultSettings.action))).toBe(
      true,
    );
  });
});

// Cycle 15 (docs/04_plan_action_layer.md): createActionLayer wraps
// resolveAction and world.spawn into a plain function matching
// ControlEventSink's shape — the same idea as the Control layer's
// createConsoleSink. Tests use a fake world (a port, matching the shape
// createWorld returns), not the real one, so this cycle tests wiring only.

function fakeWorld() {
  return { spawn: vi.fn(), step: vi.fn(), entities: vi.fn(), alpha: vi.fn() };
}

describe("createActionLayer", () => {
  it("spawns one entity into the world per resolved spec, in order", () => {
    const world = fakeWorld();
    const sink = createActionLayer({ world, config: defaultSettings.action });
    const eventA: ControlEvent = {
      kind: "single",
      signal: signal({ id: "KeyA", timestamp: 100 }),
    };
    const eventB: ControlEvent = {
      kind: "single",
      signal: signal({ id: "KeyB", timestamp: 200 }),
    };

    sink(eventA);
    sink(eventB);

    expect(world.spawn).toHaveBeenCalledTimes(2);
    expect(world.spawn).toHaveBeenNthCalledWith(
      1,
      buildFireworkSpec(eventA.signal, defaultSettings.action),
    );
    expect(world.spawn).toHaveBeenNthCalledWith(
      2,
      buildFireworkSpec(eventB.signal, defaultSettings.action),
    );
  });
});

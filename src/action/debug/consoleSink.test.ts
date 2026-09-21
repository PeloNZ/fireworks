import { describe, expect, it, vi } from "vitest";
import { createSpecConsoleSink } from "./consoleSink.ts";
import type { Firework, FireworkSpec } from "../types.ts";

// Cycle 17 (docs/04_plan_action_layer.md): createSpecConsoleSink is the
// one line that actually calls console.debug — formatFirework (cycle 16)
// stays pure, so the text itself is tested without spying on console.
// Same split as the Control layer's createConsoleSink.

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

const firework: Firework = {
  spec: fireworkSpec(),
  phase: "flying",
  position: { x: 1, y: 2, z: 0 },
  previousPosition: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 10, z: 0 },
  fuelRemainingMs: 500,
  fuseRemainingMs: 900,
  phaseElapsedMs: 0,
};

describe("createSpecConsoleSink", () => {
  it("logs the formatted firework through the given log function", () => {
    const log = vi.fn();
    const sink = createSpecConsoleSink(log);

    sink(firework);

    expect(log).toHaveBeenCalledWith(
      "KeyA:1000 phase=flying pos=(1.00,2.00,0.00) pattern=peony",
    );
  });

  it("uses console.debug when no log function is given", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const sink = createSpecConsoleSink();

    sink(firework);

    expect(spy).toHaveBeenCalledWith(
      "KeyA:1000 phase=flying pos=(1.00,2.00,0.00) pattern=peony",
    );
    spy.mockRestore();
  });
});

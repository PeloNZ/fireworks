import { describe, expect, it, vi } from "vitest";
import { createAudioVisualLayer } from "./audioVisualLayer.ts";
import { buildFrame } from "./frame.ts";
import { defaultAudioVisualConfig } from "./config.ts";
import type { Firework, FireworkSpec } from "../action/types.ts";

// Cycle 6 (docs/05_audio_visual_layer.md): createAudioVisualLayer wires
// Action's snapshot to a renderer port, one call per frame. present()
// already takes elapsedMs, per decision 5's fixed shape, but nothing
// reads it until cycle 19 wires in sound cues.

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
    colors: ["#ff3b30"],
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
    phase: "flying",
    position: { x: 5, y: 40, z: 0 },
    previousPosition: { x: 0, y: 30, z: 0 },
    velocity: spec.velocity,
    fuelRemainingMs: spec.fuelMs,
    fuseRemainingMs: spec.fuseMs,
    phaseElapsedMs: 0,
    ...overrides,
  };
}

describe("createAudioVisualLayer", () => {
  it("calls the renderer once per present, with the frame buildFrame would build", () => {
    const renderer = vi.fn();
    const layer = createAudioVisualLayer({
      renderer,
      config: defaultAudioVisualConfig,
    });
    const entities = [firework()];

    layer.present({ entities, alpha: 0.4, elapsedMs: 16 });

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(
      buildFrame({ entities, alpha: 0.4, config: defaultAudioVisualConfig }),
    );
  });
});

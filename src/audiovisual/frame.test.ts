import { describe, expect, it } from "vitest";
import { buildFrame } from "./frame.ts";
import { parseHexColor } from "./color.ts";
import { expandBurst } from "./sparks.ts";
import { defaultAudioVisualConfig } from "./config.ts";
import { defaultWorldConfig } from "../action/worldConfig.ts";
import type { Firework, FireworkSpec } from "../action/types.ts";

// Cycle 3 (docs/05_audio_visual_layer.md): the first thing to draw is the
// shell itself — one sprite per firework in flight, positioned by
// interpolating between Action's previousPosition and position so motion
// stays smooth between physics steps. Cycle 12 adds bursts; trails
// (cycles 13, 15) come later.

// An unusual shellSize, not the default, so a hardcoded size can't pass.
const config = { ...defaultAudioVisualConfig, shellSize: 2 };
const worldConfig = defaultWorldConfig;

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
    colors: ["#ff3b30", "#00c2ff"],
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

describe("buildFrame", () => {
  it("returns an empty frame for no entities", () => {
    expect(buildFrame({ entities: [], alpha: 0, config, worldConfig })).toEqual(
      {
        sprites: [],
      },
    );
  });

  it("draws one shell sprite for a flying firework, interpolated by alpha", () => {
    const entity = firework({ phase: "flying" });

    const frame = buildFrame({
      entities: [entity],
      alpha: 0.25,
      config,
      worldConfig,
    });

    expect(frame.sprites).toEqual([
      {
        kind: "shell",
        position: { x: 1.25, y: 32.5, z: 0 },
        size: config.shellSize,
        color: parseHexColor("#ff3b30"),
        brightness: 1,
      },
    ]);
  });

  it("draws a shell sprite for a launching firework too", () => {
    const entity = firework({ phase: "launching" });

    const frame = buildFrame({
      entities: [entity],
      alpha: 0,
      config,
      worldConfig,
    });

    expect(frame.sprites).toHaveLength(1);
  });

  it.each(["armed", "finished"] as const)(
    "draws nothing for phase %s",
    (phase) => {
      const entity = firework({ phase });

      const frame = buildFrame({
        entities: [entity],
        alpha: 0,
        config,
        worldConfig,
      });

      expect(frame.sprites).toEqual([]);
    },
  );

  it("draws no shell sprite for an exploding firework, only burst sprites", () => {
    const entity = firework({ phase: "exploding", phaseElapsedMs: 50 });

    const frame = buildFrame({
      entities: [entity],
      alpha: 0,
      config,
      worldConfig,
    });

    expect(frame.sprites.some((s) => s.kind === "shell")).toBe(false);
    expect(frame.sprites.length).toBeGreaterThan(0);
  });

  it("draws exploding fireworks' bursts, matching expandBurst", () => {
    const entity = firework({ phase: "exploding", phaseElapsedMs: 50 });

    const frame = buildFrame({
      entities: [entity],
      alpha: 0,
      config,
      worldConfig,
    });

    expect(frame.sprites).toEqual(expandBurst(entity, config, worldConfig));
  });
});

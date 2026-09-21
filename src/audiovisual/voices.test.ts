import { describe, expect, it } from "vitest";
import { planVoices } from "./voices.ts";
import { defaultAudioVisualConfig } from "./config.ts";
import type { Cue } from "./types.ts";
import type { FireworkSpec } from "../action/types.ts";

// Cycle 17 (docs/05_audio_visual_layer.md): the first sound — a plain
// beep on every burst. planVoices turns a cue into a voice plan, a value
// the real Web Audio adapter (cycle 18) hasn't been built yet to play.

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
    burstDurationMs: 725,
    sound: { pitch: 613, timbre: "soft" },
    seed: 1,
    ...overrides,
  };
}

// Unusual envelopes and duration, not the defaults, so a hardcoded value
// can't pass.
const config = {
  ...defaultAudioVisualConfig,
  audio: {
    ...defaultAudioVisualConfig.audio,
    burst: {
      envelope: {
        attackMs: 3,
        decayMs: 77,
        sustainLevel: 0.42,
        releaseMs: 211,
      },
    },
    launch: {
      durationMs: 333,
      envelope: {
        attackMs: 7,
        decayMs: 1,
        sustainLevel: 0.9,
        releaseMs: 44,
      },
    },
  },
};

describe("planVoices", () => {
  it("returns exactly one tone voice for a burst cue", () => {
    const spec = fireworkSpec();
    const cue: Cue = { kind: "burst", spec };

    const voices = planVoices(cue, config);

    expect(voices).toEqual([
      {
        kind: "tone",
        frequencyHz: spec.sound.pitch,
        frequencyEndHz: null,
        durationMs: spec.burstDurationMs,
        envelope: config.audio.burst.envelope,
        seed: spec.seed,
      },
    ]);
  });

  it("returns exactly one noise voice for a launch cue, rising over its duration", () => {
    const spec = fireworkSpec();
    const cue: Cue = { kind: "launch", spec };

    const voices = planVoices(cue, config);

    expect(voices).toHaveLength(1);
    const [voice] = voices;
    expect(voice?.kind).toBe("noise");
    expect(voice?.durationMs).toBe(config.audio.launch.durationMs);
    expect(voice?.envelope).toEqual(config.audio.launch.envelope);
    expect(voice?.seed).toBe(spec.seed);
    expect(voice?.frequencyEndHz).not.toBeNull();
    expect(voice?.frequencyEndHz ?? 0).toBeGreaterThan(voice?.frequencyHz ?? 0);
  });
});

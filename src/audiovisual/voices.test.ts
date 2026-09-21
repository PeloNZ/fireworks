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

// An unusual envelope, not the default, so a hardcoded envelope can't pass.
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
      },
    ]);
  });

  it("returns no voices for a launch cue", () => {
    const cue: Cue = { kind: "launch", spec: fireworkSpec() };

    expect(planVoices(cue, config)).toEqual([]);
  });
});

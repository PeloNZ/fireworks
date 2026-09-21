import { describe, expect, it } from "vitest";
import { planSillyVoices } from "./silly.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Cue } from "../types.ts";
import type { FireworkSpec } from "../../action/types.ts";

// Cycle 9 (docs/08_sound_effects.md): the silly set's launch voice, a
// slide whistle. Keeps the key-to-pitch map — every pitch here is a
// fixed ratio of spec.sound.pitch, never drawn at random.

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

// An unusual launch duration and envelope, not the defaults, so a
// hardcoded value can't pass.
const config = {
  ...defaultAudioVisualConfig,
  audio: {
    ...defaultAudioVisualConfig.audio,
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

describe("planSillyVoices", () => {
  it("plans a slide-whistle launch: a wide triangle glide with a pitch LFO", () => {
    const spec = fireworkSpec({ sound: { pitch: 613, timbre: "soft" } });
    const cue: Cue = { kind: "launch", spec };

    const voices = planSillyVoices(cue, config);

    expect(voices).toHaveLength(1);
    const [voice] = voices;
    expect(voice?.kind).toBe("tone");
    expect(voice?.waveform).toBe("triangle");
    // Rises, the same direction as the shell — a wider swoop than
    // tones' plain rising noise, not a fixed 200-900Hz sweep.
    expect(voice?.frequencyHz).toBe(spec.sound.pitch * 0.5);
    expect(voice?.frequencyEndHz).toBe(spec.sound.pitch * 3);
    expect(voice?.durationMs).toBe(config.audio.launch.durationMs);
    expect(voice?.envelope).toEqual(config.audio.launch.envelope);
    expect(voice?.seed).toBe(spec.seed);
    expect(voice?.filter).toBeNull();
    expect(voice?.startOffsetMs).toBe(0);
    expect(voice?.effect).toBeNull();
    // Scaled to this firework's own pitch, not a fixed number — an
    // unusual pitch drives the assertion so a hardcoded depth can't
    // pass.
    expect(voice?.pitchLfo?.rateHz).toBe(7);
    expect(voice?.pitchLfo?.depth).toBeCloseTo(spec.sound.pitch * 0.04);
  });

  it("plans no burst voices yet — cycles 11-13 add soft, sharp and crackle", () => {
    const spec = fireworkSpec();
    const cue: Cue = { kind: "burst", spec };

    expect(planSillyVoices(cue, config)).toEqual([]);
  });

  it("plans no flight voice yet — cycle 10 adds it", () => {
    const spec = fireworkSpec();
    const cue: Cue = { kind: "flight", spec };

    expect(planSillyVoices(cue, config)).toEqual([]);
  });
});

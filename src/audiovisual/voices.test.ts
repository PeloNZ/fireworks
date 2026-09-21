import { describe, expect, it } from "vitest";
import { planVoices } from "./voices.ts";
import { defaultAudioVisualConfig } from "./config.ts";
import type { Cue } from "./types.ts";
import type { FireworkSpec } from "../action/types.ts";

// Cycle 17 (docs/05_audio_visual_layer.md): the first sound — a plain
// beep on every burst. Cycle 22 gives each timbre its own character: a
// filter shaping the tone colour, and, for "crackle," a scatter of extra
// noise voices on top of the main tone.

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

// Unusual envelopes, duration and crackle count, not the defaults, so a
// hardcoded value can't pass.
const config = {
  ...defaultAudioVisualConfig,
  audio: {
    ...defaultAudioVisualConfig.audio,
    crackleCount: 4,
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
    expect(voice?.filter).toBeNull();
    expect(voice?.startOffsetMs).toBe(0);
    expect(voice?.frequencyEndHz).not.toBeNull();
    expect(voice?.frequencyEndHz ?? 0).toBeGreaterThan(voice?.frequencyHz ?? 0);
  });

  describe("burst — timbre", () => {
    it("soft keeps the base pitch and duration, with a lowpass filter and a longer release", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "soft" } });
      const cue: Cue = { kind: "burst", spec };

      const voices = planVoices(cue, config);

      expect(voices).toHaveLength(1);
      const [voice] = voices;
      expect(voice?.kind).toBe("tone");
      expect(voice?.frequencyHz).toBe(spec.sound.pitch);
      expect(voice?.frequencyEndHz).toBeNull();
      expect(voice?.durationMs).toBe(spec.burstDurationMs);
      expect(voice?.seed).toBe(spec.seed);
      expect(voice?.startOffsetMs).toBe(0);
      expect(voice?.filter?.kind).toBe("lowpass");
      expect(voice?.envelope.releaseMs).toBeGreaterThan(
        config.audio.burst.envelope.releaseMs,
      );
    });

    it("sharp uses a high-Q bandpass filter and a shorter, snappier release", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "sharp" } });
      const cue: Cue = { kind: "burst", spec };

      const voices = planVoices(cue, config);

      expect(voices).toHaveLength(1);
      const [voice] = voices;
      expect(voice?.kind).toBe("tone");
      expect(voice?.filter?.kind).toBe("bandpass");
      expect(voice?.filter?.q).toBeGreaterThan(5);
      expect(voice?.envelope.releaseMs).toBeLessThan(
        config.audio.burst.envelope.releaseMs,
      );
    });

    it("crackle reuses sharp's filter and release on its main voice, plus config.audio.crackleCount short noise voices staggered across the burst", () => {
      const sharpSpec = fireworkSpec({
        sound: { pitch: 613, timbre: "sharp" },
      });
      const [sharpVoice] = planVoices(
        { kind: "burst", spec: sharpSpec },
        config,
      );

      const crackleSpec = fireworkSpec({
        sound: { pitch: 613, timbre: "crackle" },
      });
      const voices = planVoices({ kind: "burst", spec: crackleSpec }, config);

      expect(voices).toHaveLength(1 + config.audio.crackleCount);
      const [main, ...crackles] = voices;
      expect(main?.kind).toBe("tone");
      expect(main?.filter).toEqual(sharpVoice?.filter);
      expect(main?.envelope.releaseMs).toBe(sharpVoice?.envelope.releaseMs);

      expect(crackles).toHaveLength(config.audio.crackleCount);
      for (const crackle of crackles) {
        expect(crackle.kind).toBe("noise");
        expect(crackle.durationMs).toBeLessThan(main?.durationMs ?? 0);
        expect(crackle.filter).toEqual(main?.filter);
        expect(crackle.startOffsetMs).toBeGreaterThanOrEqual(0);
        expect(crackle.startOffsetMs).toBeLessThan(crackleSpec.burstDurationMs);
      }
      // Staggered, not all at once — with a real generator, this many
      // draws landing on the exact same offset is vanishingly unlikely,
      // and the draw is deterministic per seed regardless.
      const offsets = new Set(crackles.map((c) => c.startOffsetMs));
      expect(offsets.size).toBeGreaterThan(1);
    });

    it("crackle is deterministic: the same spec produces the same micro-bursts", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "crackle" } });
      const cue: Cue = { kind: "burst", spec };

      const first = planVoices(cue, config);
      const second = planVoices(cue, config);

      expect(second).toEqual(first);
    });
  });
});

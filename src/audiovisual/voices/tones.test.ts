import { describe, expect, it } from "vitest";
import { planToneVoices } from "./tones.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Cue } from "../types.ts";
import type { FireworkSpec } from "../../action/types.ts";

// Cycle 17 (docs/05_audio_visual_layer.md): the first sound — a plain
// beep on every burst. Cycle 22 gives each timbre its own character.
//
// Playtesting cycle 22 found two real bugs, fixed here:
// - "sharp" and "crackle" bursts were inaudible. Their tone's fundamental
//   sits at spec.sound.pitch (220-880Hz), but the bandpass filter was
//   fixed at 3000Hz with a high Q — far outside the passband, so the
//   tone was attenuated by roughly 35dB. Every filter that shapes a
//   *tone* voice now tracks that voice's own pitch, so it can never
//   silence the fundamental it's supposed to be shaping.
// - the launch whoosh's frequencyEndHz (meant to make it rise) was never
//   wired into playback at all — it played raw, unfiltered white noise.
//   It now carries a real lowpass filter, swept by the Web Audio adapter
//   from frequencyHz to frequencyEndHz.
// A pure sine has no harmonics for a filter to shape, so soft and sharp
// now use different waveforms too — otherwise, once both pass their own
// fundamental cleanly, they'd sound identical except for release length.

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
    flight: {
      envelope: {
        attackMs: 55,
        decayMs: 20,
        sustainLevel: 0.8,
        releaseMs: 90,
      },
      gain: 0.23,
    },
  },
};

describe("planToneVoices", () => {
  it("returns exactly one noise voice for a launch cue, filtered and rising over its duration", () => {
    const spec = fireworkSpec();
    const cue: Cue = { kind: "launch", spec };

    const voices = planToneVoices(cue, config);

    expect(voices).toHaveLength(1);
    const [voice] = voices;
    expect(voice?.kind).toBe("noise");
    expect(voice?.durationMs).toBe(config.audio.launch.durationMs);
    expect(voice?.envelope).toEqual(config.audio.launch.envelope);
    expect(voice?.seed).toBe(spec.seed);
    expect(voice?.startOffsetMs).toBe(0);
    expect(voice?.gain).toBeGreaterThan(0);
    expect(voice?.gain).toBeLessThanOrEqual(1);
    // Filtered, not raw noise — a real lowpass, starting where the
    // glide starts, so the sink has something to actually sweep.
    expect(voice?.filter?.kind).toBe("lowpass");
    expect(voice?.filter?.frequencyHz).toBe(voice?.frequencyHz);
    expect(voice?.frequencyEndHz).not.toBeNull();
    expect(voice?.frequencyEndHz ?? 0).toBeGreaterThan(voice?.frequencyHz ?? 0);
  });

  it("returns one sustained tone voice for a flight cue, lasting the fuse", () => {
    const spec = fireworkSpec();
    const cue: Cue = { kind: "flight", spec };

    const voices = planToneVoices(cue, config);

    expect(voices).toHaveLength(1);
    const [voice] = voices;
    expect(voice?.kind).toBe("tone");
    expect(voice?.waveform).toBe("sine");
    expect(voice?.frequencyEndHz).toBeNull();
    expect(voice?.durationMs).toBe(spec.fuseMs);
    expect(voice?.envelope).toEqual(config.audio.flight.envelope);
    expect(voice?.gain).toBe(config.audio.flight.gain);
    expect(voice?.seed).toBe(spec.seed);
    expect(voice?.filter).toBeNull();
    expect(voice?.startOffsetMs).toBe(0);
    // A distinct, lower pitch from the burst's own — not just a copy of
    // it — so flight doesn't sound like a held burst.
    expect(voice?.frequencyHz).toBeLessThan(spec.sound.pitch);
    expect(voice?.frequencyHz).toBeGreaterThan(0);
  });

  describe("burst — timbre", () => {
    it("soft's filter always passes its own pitch: a lowpass cutoff above it", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "soft" } });
      const cue: Cue = { kind: "burst", spec };

      const voices = planToneVoices(cue, config);

      expect(voices).toHaveLength(1);
      const [voice] = voices;
      expect(voice?.kind).toBe("tone");
      expect(voice?.waveform).toBe("sine");
      expect(voice?.frequencyHz).toBe(spec.sound.pitch);
      expect(voice?.frequencyEndHz).toBeNull();
      expect(voice?.durationMs).toBe(spec.burstDurationMs);
      expect(voice?.gain).toBe(1);
      expect(voice?.seed).toBe(spec.seed);
      expect(voice?.startOffsetMs).toBe(0);
      expect(voice?.filter?.kind).toBe("lowpass");
      expect(voice?.filter?.frequencyHz ?? 0).toBeGreaterThan(spec.sound.pitch);
      expect(voice?.envelope.releaseMs).toBeGreaterThan(
        config.audio.burst.envelope.releaseMs,
      );
    });

    it("sharp's filter is centred exactly on its own pitch, so the fundamental always passes", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "sharp" } });
      const cue: Cue = { kind: "burst", spec };

      const voices = planToneVoices(cue, config);

      expect(voices).toHaveLength(1);
      const [voice] = voices;
      expect(voice?.kind).toBe("tone");
      expect(voice?.waveform).toBe("sawtooth");
      expect(voice?.filter?.kind).toBe("bandpass");
      expect(voice?.filter?.frequencyHz).toBe(spec.sound.pitch);
      expect(voice?.envelope.releaseMs).toBeLessThan(
        config.audio.burst.envelope.releaseMs,
      );
    });

    it("crackle's main voice matches sharp's shape, but its micro-bursts use their own independent filter", () => {
      const sharpSpec = fireworkSpec({
        sound: { pitch: 613, timbre: "sharp" },
      });
      const [sharpVoice] = planToneVoices(
        { kind: "burst", spec: sharpSpec },
        config,
      );

      const crackleSpec = fireworkSpec({
        sound: { pitch: 613, timbre: "crackle" },
      });
      const voices = planToneVoices(
        { kind: "burst", spec: crackleSpec },
        config,
      );

      expect(voices).toHaveLength(1 + config.audio.crackleCount);
      const [main, ...crackles] = voices;
      expect(main?.kind).toBe("tone");
      expect(main?.filter).toEqual(sharpVoice?.filter);
      expect(main?.envelope.releaseMs).toBe(sharpVoice?.envelope.releaseMs);

      expect(crackles).toHaveLength(config.audio.crackleCount);
      for (const crackle of crackles) {
        expect(crackle.kind).toBe("noise");
        expect(crackle.durationMs).toBeLessThan(main?.durationMs ?? 0);
        // A broadband noise micro-burst isn't silenced by sitting far
        // from any one pitch, unlike a pure tone — it keeps its own
        // fixed, bright filter rather than tracking the firework's pitch.
        expect(crackle.filter).not.toEqual(main?.filter);
        expect(crackle.filter?.kind).toBe("bandpass");
        expect(crackle.gain).toBeGreaterThan(0);
        expect(crackle.gain).toBeLessThan(1);
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

      const first = planToneVoices(cue, config);
      const second = planToneVoices(cue, config);

      expect(second).toEqual(first);
    });
  });
});

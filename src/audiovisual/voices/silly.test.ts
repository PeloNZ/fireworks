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

// An unusual launch duration, envelope and flight gain, not the
// defaults, so a hardcoded value can't pass.
const config = {
  ...defaultAudioVisualConfig,
  audio: {
    ...defaultAudioVisualConfig.audio,
    burst: {
      envelope: {
        attackMs: 4,
        decayMs: 40,
        sustainLevel: 0.35,
        releaseMs: 180,
      },
    },
    crackleCount: 4,
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
        attackMs: 88,
        decayMs: 12,
        sustainLevel: 0.7,
        releaseMs: 130,
      },
      gain: 0.23,
    },
    sets: {
      silly: {
        flightVoiceGain: 0.11,
        bounceCount: 3,
        bounceDecay: 0.5,
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

  describe("burst — soft, the boing", () => {
    it("glides a square wave down with a fast wide LFO, then bounceCount bounces decaying by bounceDecay", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "soft" } });
      const cue: Cue = { kind: "burst", spec };

      const voices = planSillyVoices(cue, config);

      const { bounceCount, bounceDecay } = config.audio.sets.silly;
      expect(voices).toHaveLength(1 + bounceCount);
      const [main, ...bounces] = voices;
      expect(main?.kind).toBe("tone");
      expect(main?.waveform).toBe("square");
      // Starts high, glides down — the downward half of "move the pitch
      // a long way, fast."
      expect(main?.frequencyHz).toBe(spec.sound.pitch * 2);
      expect(main?.frequencyEndHz).toBe(spec.sound.pitch * 0.75);
      expect(main?.envelope).toEqual(config.audio.burst.envelope);
      expect(main?.seed).toBe(spec.seed);
      expect(main?.filter).toBeNull();
      expect(main?.startOffsetMs).toBe(0);
      expect(main?.effect).toBeNull();
      // Fast and wide — scaled to this firework's own pitch, not fixed.
      expect(main?.pitchLfo?.rateHz).toBe(16);
      expect(main?.pitchLfo?.depth).toBeCloseTo(spec.sound.pitch * 0.15);

      expect(bounces).toHaveLength(bounceCount);
      let expectedGain = main?.gain ?? 0;
      let expectedDuration = main?.durationMs ?? 0;
      let expectedOffset = main?.durationMs ?? 0;
      for (const bounce of bounces) {
        expectedGain *= bounceDecay;
        expectedDuration *= bounceDecay;
        // Same shape as the main voice — only gain, duration and start
        // offset change.
        expect(bounce.waveform).toBe(main?.waveform);
        expect(bounce.frequencyHz).toBe(main?.frequencyHz);
        expect(bounce.frequencyEndHz).toBe(main?.frequencyEndHz);
        expect(bounce.gain).toBeCloseTo(expectedGain);
        expect(bounce.durationMs).toBeCloseTo(expectedDuration);
        expect(bounce.startOffsetMs).toBeCloseTo(expectedOffset);
        expectedOffset += expectedDuration;
      }
    });
  });

  describe("burst — sharp, the clang", () => {
    it("ring modulates a sawtooth at a seed-drawn ratio of its own pitch", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "sharp" } });
      const cue: Cue = { kind: "burst", spec };

      const voices = planSillyVoices(cue, config);

      expect(voices).toHaveLength(1);
      const [voice] = voices;
      expect(voice?.kind).toBe("tone");
      expect(voice?.waveform).toBe("sawtooth");
      // The carrier holds the burst's own pitch flat — only the ring
      // modulator's frequency is drawn, not this one.
      expect(voice?.frequencyHz).toBe(spec.sound.pitch);
      expect(voice?.frequencyEndHz).toBeNull();
      expect(voice?.durationMs).toBe(spec.burstDurationMs);
      expect(voice?.gain).toBe(1);
      expect(voice?.seed).toBe(spec.seed);
      expect(voice?.filter).toBeNull();
      expect(voice?.startOffsetMs).toBe(0);
      expect(voice?.pitchLfo).toBeNull();
      expect(voice?.filterLfo).toBeNull();
      // Short and snappy — the same release shortening tones' own sharp
      // uses, against an unusual burst envelope so a hardcoded release
      // can't pass.
      expect(voice?.envelope.attackMs).toBe(
        config.audio.burst.envelope.attackMs,
      );
      expect(voice?.envelope.decayMs).toBe(config.audio.burst.envelope.decayMs);
      expect(voice?.envelope.sustainLevel).toBe(
        config.audio.burst.envelope.sustainLevel,
      );
      expect(voice?.envelope.releaseMs).toBeCloseTo(
        config.audio.burst.envelope.releaseMs * 0.3,
      );

      expect(voice?.effect?.kind).toBe("ringmod");
      const ratio =
        voice?.effect?.kind === "ringmod"
          ? voice.effect.frequencyHz / spec.sound.pitch
          : 0;
      expect(ratio).toBeGreaterThanOrEqual(1.4);
      expect(ratio).toBeLessThanOrEqual(2.8);
    });

    it("draws the ratio from the seed: same seed same clang, different seed different clang", () => {
      const specA = fireworkSpec({ sound: { pitch: 613, timbre: "sharp" } });
      const cueA: Cue = { kind: "burst", spec: specA };
      const cueA2: Cue = { kind: "burst", spec: specA };
      const cueB: Cue = {
        kind: "burst",
        spec: fireworkSpec({
          sound: { pitch: 613, timbre: "sharp" },
          seed: specA.seed + 1,
        }),
      };

      expect(planSillyVoices(cueA, config)).toEqual(
        planSillyVoices(cueA2, config),
      );

      const [voiceA] = planSillyVoices(cueA, config);
      const [voiceB] = planSillyVoices(cueB, config);
      expect(voiceA?.effect).not.toEqual(voiceB?.effect);
    });
  });

  describe("burst — crackle, the fizz", () => {
    it("plans a flanged noise body plus crackleCount square-wave micro-tones", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "crackle" } });
      const cue: Cue = { kind: "burst", spec };

      const voices = planSillyVoices(cue, config);

      expect(voices).toHaveLength(1 + config.audio.crackleCount);
      const [body, ...microTones] = voices;
      expect(body?.kind).toBe("noise");
      expect(body?.filter?.kind).toBe("bandpass");
      expect(body?.durationMs).toBe(spec.burstDurationMs);
      expect(body?.envelope).toEqual(config.audio.burst.envelope);
      expect(body?.seed).toBe(spec.seed);
      expect(body?.startOffsetMs).toBe(0);
      expect(body?.pitchLfo).toBeNull();
      expect(body?.filterLfo).toBeNull();
      // Flanged, not ring modulated or phased — squeaks over a
      // whooshing body, not a clang or a swirl.
      expect(body?.effect?.kind).toBe("flanger");

      expect(microTones).toHaveLength(config.audio.crackleCount);
      for (const microTone of microTones) {
        expect(microTone.kind).toBe("tone");
        expect(microTone.waveform).toBe("square");
        expect(microTone.filter).toBeNull();
        expect(microTone.effect).toBeNull();
        // Short blips, quieter than the body, each pitched between 3
        // and 8 times the burst's own — squeaks, not static.
        expect(microTone.durationMs).toBeLessThan(body?.durationMs ?? 0);
        expect(microTone.gain).toBeGreaterThan(0);
        expect(microTone.gain).toBeLessThan(1);
        expect(microTone.frequencyHz).toBeGreaterThanOrEqual(
          spec.sound.pitch * 3,
        );
        expect(microTone.frequencyHz).toBeLessThanOrEqual(spec.sound.pitch * 8);
        expect(microTone.startOffsetMs).toBeGreaterThanOrEqual(0);
        expect(microTone.startOffsetMs).toBeLessThan(spec.burstDurationMs);
      }
      // Staggered, not all at once — with a real generator, this many
      // draws landing on the exact same offset is vanishingly unlikely.
      const offsets = new Set(microTones.map((v) => v.startOffsetMs));
      expect(offsets.size).toBeGreaterThan(1);
      // Different pitches too, not one repeated squeak.
      const pitches = new Set(microTones.map((v) => v.frequencyHz));
      expect(pitches.size).toBeGreaterThan(1);
    });

    it("is deterministic: the same spec produces the same fizz", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "crackle" } });
      const cue: Cue = { kind: "burst", spec };

      const first = planSillyVoices(cue, config);
      const second = planSillyVoices(cue, config);

      expect(second).toEqual(first);
    });
  });

  describe("flight", () => {
    it("plans two detuned sine voices, both wobbling, both quieter than flight.gain", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "soft" } });
      const cue: Cue = { kind: "flight", spec };

      const voices = planSillyVoices(cue, config);

      expect(voices).toHaveLength(2);
      const [first, second] = voices;
      for (const voice of [first, second]) {
        expect(voice?.kind).toBe("tone");
        expect(voice?.waveform).toBe("sine");
        expect(voice?.frequencyEndHz).toBeNull();
        expect(voice?.durationMs).toBe(spec.fuseMs);
        expect(voice?.envelope).toEqual(config.audio.flight.envelope);
        expect(voice?.gain).toBe(config.audio.sets.silly.flightVoiceGain);
        expect(voice?.seed).toBe(spec.seed);
        expect(voice?.filter).toBeNull();
        expect(voice?.startOffsetMs).toBe(0);
        expect(voice?.effect).toBeNull();
      }
      // Two voices summing must not exceed flight.gain, the whole
      // reason for a dedicated, quieter silly.flightVoiceGain.
      expect((first?.gain ?? 0) + (second?.gain ?? 0)).toBeLessThanOrEqual(
        config.audio.flight.gain,
      );

      // Base pitch at half the burst's own, same as tones' flight.
      expect(first?.frequencyHz).toBe(spec.sound.pitch * 0.5);
      // Detuned from the first, not identical — the beat between them
      // is the whole effect. 2-6Hz apart.
      const detune = (second?.frequencyHz ?? 0) - (first?.frequencyHz ?? 0);
      expect(detune).toBeGreaterThanOrEqual(2);
      expect(detune).toBeLessThanOrEqual(6);

      // One shared wobble rate for both voices, drawn per press, 4-9Hz.
      expect(first?.pitchLfo?.rateHz).toBe(second?.pitchLfo?.rateHz);
      expect(first?.pitchLfo?.rateHz ?? 0).toBeGreaterThanOrEqual(4);
      expect(first?.pitchLfo?.rateHz ?? 0).toBeLessThanOrEqual(9);
    });

    it("draws the detune and wobble rate from the seed: same seed, same draw", () => {
      const spec = fireworkSpec({ sound: { pitch: 613, timbre: "soft" } });
      const cue: Cue = { kind: "flight", spec };

      const first = planSillyVoices(cue, config);
      const second = planSillyVoices(cue, config);

      expect(second).toEqual(first);
    });

    it("draws a different detune and wobble rate for a different seed", () => {
      const cueA: Cue = {
        kind: "flight",
        spec: fireworkSpec({ seed: 1 }),
      };
      const cueB: Cue = {
        kind: "flight",
        spec: fireworkSpec({ seed: 2 }),
      };

      const [firstA, secondA] = planSillyVoices(cueA, config);
      const [firstB, secondB] = planSillyVoices(cueB, config);

      // With a real generator, two different seeds landing on the exact
      // same detune and rate is vanishingly unlikely.
      expect(secondA?.frequencyHz).not.toBe(secondB?.frequencyHz);
      expect(firstA?.pitchLfo?.rateHz).not.toBe(firstB?.pitchLfo?.rateHz);
    });
  });
});

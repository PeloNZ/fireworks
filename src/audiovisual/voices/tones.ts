import { createRandom } from "../../action/random.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Cue, Envelope, Filter, Voice } from "../types.ts";

// The launch whoosh's frequency sweep. Every launch has the same shape —
// this isn't something a per-firework config value needs to vary.
const LAUNCH_START_HZ = 200;
const LAUNCH_END_HZ = 900;
const LAUNCH_FILTER_Q = 1;
const LAUNCH_VOICE_GAIN = 0.6;

// The flight whistle sits an octave below the burst's own pitch, so a
// key's family carries through without flight sounding like a held
// burst.
const FLIGHT_PITCH_RATIO = 0.5;

// A lowpass cutoff this far above a tone's own pitch always passes the
// fundamental cleanly, so "soft" can never end up silencing the very
// tone it's meant to be shaping — it only dulls what's above it.
const SOFT_CUTOFF_MULTIPLIER = 1.8;
const SOFT_FILTER_Q = 1;

// Centred exactly on the tone's own pitch: a bandpass filter has unity
// gain at its centre frequency regardless of Q, so this can never
// silence the fundamental either, however narrow Q makes it.
const SHARP_FILTER_Q = 6;
const SOFT_RELEASE_MULTIPLIER = 1.5;
const SHARP_RELEASE_MULTIPLIER = 0.3;

// Crackle's micro-bursts are noise, not a single pitch — broadband noise
// really does have energy at a fixed high frequency, so unlike the tone
// filters above, this one doesn't need to track anything per firework.
const CRACKLE_NOISE_FILTER: Filter = {
  kind: "bandpass",
  frequencyHz: 4000,
  q: 8,
};
const CRACKLE_VOICE_DURATION_MS = 30;
const CRACKLE_VOICE_GAIN = 0.5;
const CRACKLE_ENVELOPE: Envelope = {
  attackMs: 1,
  decayMs: 0,
  sustainLevel: 1,
  releaseMs: 15,
};

function withRelease(envelope: Envelope, multiplier: number): Envelope {
  return { ...envelope, releaseMs: envelope.releaseMs * multiplier };
}

function softFilterFor(pitchHz: number): Filter {
  return {
    kind: "lowpass",
    frequencyHz: pitchHz * SOFT_CUTOFF_MULTIPLIER,
    q: SOFT_FILTER_Q,
  };
}

function sharpFilterFor(pitchHz: number): Filter {
  return { kind: "bandpass", frequencyHz: pitchHz, q: SHARP_FILTER_Q };
}

function planBurstVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  const pitch = cue.spec.sound.pitch;
  const base: Voice = {
    kind: "tone",
    waveform: "sine",
    frequencyHz: pitch,
    frequencyEndHz: null,
    durationMs: cue.spec.burstDurationMs,
    envelope: config.audio.burst.envelope,
    gain: 1,
    seed: cue.spec.seed,
    filter: null,
    startOffsetMs: 0,
  };

  switch (cue.spec.sound.timbre) {
    case "soft":
      return [
        {
          ...base,
          filter: softFilterFor(pitch),
          envelope: withRelease(base.envelope, SOFT_RELEASE_MULTIPLIER),
        },
      ];
    case "sharp":
      return [
        {
          ...base,
          waveform: "sawtooth",
          filter: sharpFilterFor(pitch),
          envelope: withRelease(base.envelope, SHARP_RELEASE_MULTIPLIER),
        },
      ];
    case "crackle": {
      const main: Voice = {
        ...base,
        waveform: "sawtooth",
        filter: sharpFilterFor(pitch),
        envelope: withRelease(base.envelope, SHARP_RELEASE_MULTIPLIER),
      };
      const random = createRandom(cue.spec.seed);
      const crackles: Voice[] = Array.from(
        { length: config.audio.crackleCount },
        () => ({
          kind: "noise",
          waveform: "sine",
          frequencyHz: CRACKLE_NOISE_FILTER.frequencyHz,
          frequencyEndHz: null,
          durationMs: CRACKLE_VOICE_DURATION_MS,
          envelope: CRACKLE_ENVELOPE,
          gain: CRACKLE_VOICE_GAIN,
          seed: cue.spec.seed,
          filter: CRACKLE_NOISE_FILTER,
          startOffsetMs: random() * cue.spec.burstDurationMs,
        }),
      );
      return [main, ...crackles];
    }
  }
}

function planLaunchVoice(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  return [
    {
      kind: "noise",
      waveform: "sine", // unused — noise has no oscillator to shape
      frequencyHz: LAUNCH_START_HZ,
      frequencyEndHz: LAUNCH_END_HZ,
      durationMs: config.audio.launch.durationMs,
      envelope: config.audio.launch.envelope,
      gain: LAUNCH_VOICE_GAIN,
      seed: cue.spec.seed,
      // Noise has no pitch of its own to glide, so the rise is a
      // lowpass cutoff sweeping from frequencyHz to frequencyEndHz —
      // without this filter, the sink has nothing to sweep and the
      // whoosh plays as flat, unfiltered white noise.
      filter: {
        kind: "lowpass",
        frequencyHz: LAUNCH_START_HZ,
        q: LAUNCH_FILTER_Q,
      },
      startOffsetMs: 0,
    },
  ];
}

function planFlightVoice(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  return [
    {
      kind: "tone",
      waveform: "sine",
      frequencyHz: cue.spec.sound.pitch * FLIGHT_PITCH_RATIO,
      frequencyEndHz: null,
      durationMs: cue.spec.fuseMs,
      envelope: config.audio.flight.envelope,
      gain: config.audio.flight.gain,
      seed: cue.spec.seed,
      filter: null,
      startOffsetMs: 0,
    },
  ];
}

/**
 * Turns a cue into the voices it should play. A `"burst"` cue plans a
 * tone at the firework's own pitch, shaped by its timbre: `"soft"` is a
 * lowpass tuned above that pitch so it dulls only what's above it,
 * `"sharp"` a bandpass centred exactly on it so the fundamental always
 * passes, and `"crackle"` is sharp's bang plus a scatter of tiny extra
 * noise voices — their own fixed, bright filter, since broadband noise
 * (unlike a single tone) really does carry energy up there. A `"launch"`
 * cue plans one filtered noise voice whose cutoff rises over its
 * duration — the whoosh of a shell leaving the ground. A `"flight"` cue
 * plans one quiet, sustained tone for as long as the fuse burns — the
 * whistle of a shell in the air.
 */
export function planToneVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  switch (cue.kind) {
    case "burst":
      return planBurstVoices(cue, config);
    case "launch":
      return planLaunchVoice(cue, config);
    case "flight":
      return planFlightVoice(cue, config);
  }
}

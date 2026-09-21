import { createRandom } from "../../action/random.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Cue, Envelope, Voice } from "../types.ts";

// Scales a draw from `random()`'s [0, 1) into [min, max).
function scaleTo(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

// The slide-whistle launch glide: down near half the burst's own
// pitch, up to three times it — much wider than tones' plain 200-900Hz
// rise, the first rule in "What actually makes a sound read as a
// cartoon" (docs/08_sound_effects.md): move the pitch a long way, fast.
// Both ratios of spec.sound.pitch, never a fixed frequency, so the
// glide always tracks this firework's own note.
const LAUNCH_START_RATIO = 0.5;
const LAUNCH_END_RATIO = 3;
const LAUNCH_LFO_RATE_HZ = 7;
const LAUNCH_LFO_DEPTH_RATIO = 0.04;
const LAUNCH_VOICE_GAIN = 0.6;

function planSillyLaunchVoice(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  const pitch = cue.spec.sound.pitch;
  return [
    {
      kind: "tone",
      waveform: "triangle",
      frequencyHz: pitch * LAUNCH_START_RATIO,
      frequencyEndHz: pitch * LAUNCH_END_RATIO,
      durationMs: config.audio.launch.durationMs,
      envelope: config.audio.launch.envelope,
      gain: LAUNCH_VOICE_GAIN,
      seed: cue.spec.seed,
      filter: null,
      startOffsetMs: 0,
      pitchLfo: {
        rateHz: LAUNCH_LFO_RATE_HZ,
        depth: pitch * LAUNCH_LFO_DEPTH_RATIO,
      },
      filterLfo: null,
      effect: null,
    },
  ];
}

// A wobbling theremin, not a plain whistle: two sine voices a few Hz
// apart beat against each other, and one shared LFO wobbles both. The
// detune and the wobble rate are drawn per press, not fixed, so no two
// presses of the same key hover quite the same way — requirement 6 in
// docs/08_sound_effects.md. The base pitch itself is not drawn: it's
// half spec.sound.pitch, same ratio tones' own flight voice uses, so
// the key-to-pitch map still holds.
const FLIGHT_PITCH_RATIO = 0.5;
const FLIGHT_DETUNE_MIN_HZ = 2;
const FLIGHT_DETUNE_MAX_HZ = 6;
const FLIGHT_LFO_RATE_MIN_HZ = 4;
const FLIGHT_LFO_RATE_MAX_HZ = 9;
const FLIGHT_LFO_DEPTH_RATIO = 0.03;

function planSillyFlightVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  const pitch = cue.spec.sound.pitch;
  const random = createRandom(cue.spec.seed);
  const detuneHz = scaleTo(random, FLIGHT_DETUNE_MIN_HZ, FLIGHT_DETUNE_MAX_HZ);
  const lfoRateHz = scaleTo(
    random,
    FLIGHT_LFO_RATE_MIN_HZ,
    FLIGHT_LFO_RATE_MAX_HZ,
  );
  const base: Voice = {
    kind: "tone",
    waveform: "sine",
    frequencyHz: pitch * FLIGHT_PITCH_RATIO,
    frequencyEndHz: null,
    durationMs: cue.spec.fuseMs,
    envelope: config.audio.flight.envelope,
    gain: config.audio.sets.silly.flightVoiceGain,
    seed: cue.spec.seed,
    filter: null,
    startOffsetMs: 0,
    pitchLfo: {
      rateHz: lfoRateHz,
      depth: pitch * FLIGHT_LFO_DEPTH_RATIO,
    },
    filterLfo: null,
    effect: null,
  };
  return [base, { ...base, frequencyHz: base.frequencyHz + detuneHz }];
}

// A boing: a square wave sliding down from twice the burst's own pitch
// to three quarters of it, wobbled by a fast, wide LFO — the downward
// half of "move the pitch a long way, fast." Then it bounces: each
// extra voice is the same shape, starting where the last one ended
// (`startOffsetMs`), at `bounceDecay` of its gain and duration — a
// shrinking series of bounces off a floor, not one flat repeat.
const SOFT_START_RATIO = 2;
const SOFT_END_RATIO = 0.75;
const SOFT_DURATION_MS = 250;
const SOFT_LFO_RATE_HZ = 16;
const SOFT_LFO_DEPTH_RATIO = 0.15;
const SOFT_VOICE_GAIN = 1;

function planSillySoftBurstVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  const pitch = cue.spec.sound.pitch;
  const main: Voice = {
    kind: "tone",
    waveform: "square",
    frequencyHz: pitch * SOFT_START_RATIO,
    frequencyEndHz: pitch * SOFT_END_RATIO,
    durationMs: SOFT_DURATION_MS,
    envelope: config.audio.burst.envelope,
    gain: SOFT_VOICE_GAIN,
    seed: cue.spec.seed,
    filter: null,
    startOffsetMs: 0,
    pitchLfo: {
      rateHz: SOFT_LFO_RATE_HZ,
      depth: pitch * SOFT_LFO_DEPTH_RATIO,
    },
    filterLfo: null,
    effect: null,
  };

  const { bounceCount, bounceDecay } = config.audio.sets.silly;
  const voices: Voice[] = [main];
  let previous = main;
  let offset = main.durationMs;
  for (let i = 0; i < bounceCount; i++) {
    const bounce: Voice = {
      ...previous,
      gain: previous.gain * bounceDecay,
      durationMs: previous.durationMs * bounceDecay,
      startOffsetMs: offset,
    };
    voices.push(bounce);
    offset += bounce.durationMs;
    previous = bounce;
  }
  return voices;
}

// A clang: a sawtooth at the burst's own pitch, ring modulated by a
// frequency an awkward multiple of it — 1.4-2.8, drawn per press, never
// a round number, so the sidebands stay off the harmonic series and the
// clang stays inharmonic. Release shortened the same way tones' own
// sharp shortens its release: snappy, not sustained.
const SHARP_RATIO_MIN = 1.4;
const SHARP_RATIO_MAX = 2.8;
const SHARP_RELEASE_MULTIPLIER = 0.3;

function planSillySharpBurstVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  const pitch = cue.spec.sound.pitch;
  const random = createRandom(cue.spec.seed);
  const ratio = scaleTo(random, SHARP_RATIO_MIN, SHARP_RATIO_MAX);
  const envelope = config.audio.burst.envelope;
  return [
    {
      kind: "tone",
      waveform: "sawtooth",
      frequencyHz: pitch,
      frequencyEndHz: null,
      durationMs: cue.spec.burstDurationMs,
      envelope: {
        ...envelope,
        releaseMs: envelope.releaseMs * SHARP_RELEASE_MULTIPLIER,
      },
      gain: 1,
      seed: cue.spec.seed,
      filter: null,
      startOffsetMs: 0,
      pitchLfo: null,
      filterLfo: null,
      effect: { kind: "ringmod", frequencyHz: pitch * ratio },
    },
  ];
}

// A fizz: a bandpass-filtered noise body run through a flanger — a
// whoosh with movement, not a flat bang — plus a scatter of short
// square-wave squeaks instead of tones' own noise micro-bursts.
// crackleCount is shared with tones — it already exists under
// config.audio for exactly this purpose. The body's own filter sits at
// a fixed bright frequency, the same reasoning tones' crackle
// micro-bursts use: broadband noise genuinely carries energy up there,
// unlike a single tone, so there's nothing to track per firework.
const CRACKLE_BODY_FILTER_HZ = 4000;
const CRACKLE_BODY_FILTER_Q = 8;
const CRACKLE_FLANGER_DELAY_MS = 4;
const CRACKLE_FLANGER_FEEDBACK = 0.4;
const CRACKLE_FLANGER_LFO_RATE_HZ = 0.4;
const CRACKLE_FLANGER_LFO_DEPTH_SECONDS = 0.002;
const CRACKLE_MICRO_TONE_RATIO_MIN = 3;
const CRACKLE_MICRO_TONE_RATIO_MAX = 8;
const CRACKLE_MICRO_TONE_DURATION_MS = 30;
const CRACKLE_MICRO_TONE_GAIN = 0.5;
const CRACKLE_MICRO_TONE_ENVELOPE: Envelope = {
  attackMs: 1,
  decayMs: 0,
  sustainLevel: 1,
  releaseMs: 15,
};

function planSillyCrackleBurstVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  const pitch = cue.spec.sound.pitch;
  const random = createRandom(cue.spec.seed);

  const body: Voice = {
    kind: "noise",
    waveform: "sine", // unused — noise has no oscillator to shape
    frequencyHz: CRACKLE_BODY_FILTER_HZ,
    frequencyEndHz: null,
    durationMs: cue.spec.burstDurationMs,
    envelope: config.audio.burst.envelope,
    gain: 1,
    seed: cue.spec.seed,
    filter: {
      kind: "bandpass",
      frequencyHz: CRACKLE_BODY_FILTER_HZ,
      q: CRACKLE_BODY_FILTER_Q,
    },
    startOffsetMs: 0,
    pitchLfo: null,
    filterLfo: null,
    effect: {
      kind: "flanger",
      delayMs: CRACKLE_FLANGER_DELAY_MS,
      feedback: CRACKLE_FLANGER_FEEDBACK,
      lfo: {
        rateHz: CRACKLE_FLANGER_LFO_RATE_HZ,
        depth: CRACKLE_FLANGER_LFO_DEPTH_SECONDS,
      },
    },
  };

  const microTones: Voice[] = Array.from(
    { length: config.audio.crackleCount },
    () => {
      const ratio = scaleTo(
        random,
        CRACKLE_MICRO_TONE_RATIO_MIN,
        CRACKLE_MICRO_TONE_RATIO_MAX,
      );
      const startOffsetMs = random() * cue.spec.burstDurationMs;
      return {
        kind: "tone",
        waveform: "square",
        frequencyHz: pitch * ratio,
        frequencyEndHz: null,
        durationMs: CRACKLE_MICRO_TONE_DURATION_MS,
        envelope: CRACKLE_MICRO_TONE_ENVELOPE,
        gain: CRACKLE_MICRO_TONE_GAIN,
        seed: cue.spec.seed,
        filter: null,
        startOffsetMs,
        pitchLfo: null,
        filterLfo: null,
        effect: null,
      };
    },
  );

  return [body, ...microTones];
}

function planSillyBurstVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  switch (cue.spec.sound.timbre) {
    case "soft":
      return planSillySoftBurstVoices(cue, config);
    case "sharp":
      return planSillySharpBurstVoices(cue, config);
    case "crackle":
      return planSillyCrackleBurstVoices(cue, config);
  }
}

/**
 * The silly sound set: cartoonish, wobbly, a different surprise on
 * every press — but every voice's own pitch is still a fixed ratio of
 * `cue.spec.sound.pitch`, so the key-to-pitch map `planToneVoices`
 * gives survives here too. See docs/08_sound_effects.md.
 */
export function planSillyVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  switch (cue.kind) {
    case "launch":
      return planSillyLaunchVoice(cue, config);
    case "burst":
      return planSillyBurstVoices(cue, config);
    case "flight":
      return planSillyFlightVoices(cue, config);
  }
}

import { createRandom } from "../../action/random.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Cue, Voice } from "../types.ts";

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
      return []; // cycles 11-13 add soft, sharp and crackle
    case "flight":
      return planSillyFlightVoices(cue, config);
  }
}

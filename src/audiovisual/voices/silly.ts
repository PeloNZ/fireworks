import type { AudioVisualConfig } from "../config.ts";
import type { Cue, Voice } from "../types.ts";

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
      return []; // cycle 10 adds this
  }
}

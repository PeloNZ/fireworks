import { createRandom } from "../action/random.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { Cue, Envelope, Filter, Voice } from "./types.ts";

// The launch whoosh's frequency sweep. Every launch has the same shape —
// this isn't something a per-firework config value needs to vary.
const LAUNCH_START_HZ = 200;
const LAUNCH_END_HZ = 900;

// Soft is a low, gentle filter with a long tail; sharp and crackle share
// a narrow, high filter with a short one — the same character, since
// crackle is sharp's bang plus extra micro-bursts on top.
const SOFT_FILTER: Filter = { kind: "lowpass", frequencyHz: 600, q: 1 };
const SHARP_FILTER: Filter = { kind: "bandpass", frequencyHz: 3000, q: 12 };
const SOFT_RELEASE_MULTIPLIER = 1.5;
const SHARP_RELEASE_MULTIPLIER = 0.3;

// Crackle's micro-bursts: tiny, sharp taps, unrelated to the main burst
// envelope's own shape.
const CRACKLE_VOICE_DURATION_MS = 30;
const CRACKLE_ENVELOPE: Envelope = {
  attackMs: 1,
  decayMs: 0,
  sustainLevel: 1,
  releaseMs: 15,
};

function withRelease(envelope: Envelope, multiplier: number): Envelope {
  return { ...envelope, releaseMs: envelope.releaseMs * multiplier };
}

function planBurstVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  const base: Voice = {
    kind: "tone",
    frequencyHz: cue.spec.sound.pitch,
    frequencyEndHz: null,
    durationMs: cue.spec.burstDurationMs,
    envelope: config.audio.burst.envelope,
    seed: cue.spec.seed,
    filter: null,
    startOffsetMs: 0,
  };

  switch (cue.spec.sound.timbre) {
    case "soft":
      return [
        {
          ...base,
          filter: SOFT_FILTER,
          envelope: withRelease(base.envelope, SOFT_RELEASE_MULTIPLIER),
        },
      ];
    case "sharp":
      return [
        {
          ...base,
          filter: SHARP_FILTER,
          envelope: withRelease(base.envelope, SHARP_RELEASE_MULTIPLIER),
        },
      ];
    case "crackle": {
      const main: Voice = {
        ...base,
        filter: SHARP_FILTER,
        envelope: withRelease(base.envelope, SHARP_RELEASE_MULTIPLIER),
      };
      const random = createRandom(cue.spec.seed);
      const crackles: Voice[] = Array.from(
        { length: config.audio.crackleCount },
        () => ({
          kind: "noise",
          frequencyHz: SHARP_FILTER.frequencyHz,
          frequencyEndHz: null,
          durationMs: CRACKLE_VOICE_DURATION_MS,
          envelope: CRACKLE_ENVELOPE,
          seed: cue.spec.seed,
          filter: SHARP_FILTER,
          startOffsetMs: random() * cue.spec.burstDurationMs,
        }),
      );
      return [main, ...crackles];
    }
  }
}

/**
 * Turns a cue into the voices it should play. A `"burst"` cue plans a
 * tone at the firework's own pitch, shaped by its timbre: `"soft"` is a
 * low filter with a long tail, `"sharp"` a narrow high filter with a
 * short one, and `"crackle"` is sharp's bang plus a scatter of tiny extra
 * noise voices staggered across the burst. A `"launch"` cue plans one
 * noise voice that rises over its duration — the whoosh of a shell
 * leaving the ground.
 */
export function planVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  if (cue.kind === "burst") {
    return planBurstVoices(cue, config);
  }
  return [
    {
      kind: "noise",
      frequencyHz: LAUNCH_START_HZ,
      frequencyEndHz: LAUNCH_END_HZ,
      durationMs: config.audio.launch.durationMs,
      envelope: config.audio.launch.envelope,
      seed: cue.spec.seed,
      filter: null,
      startOffsetMs: 0,
    },
  ];
}

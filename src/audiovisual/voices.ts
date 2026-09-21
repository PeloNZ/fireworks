import type { AudioVisualConfig } from "./config.ts";
import type { Cue, Voice } from "./types.ts";

// The launch whoosh's frequency sweep. Every launch has the same shape —
// this isn't something a per-firework config value needs to vary.
const LAUNCH_START_HZ = 200;
const LAUNCH_END_HZ = 900;

/**
 * Turns a cue into the voices it should play. A `"burst"` cue plans one
 * constant-pitch tone at the firework's own pitch, decaying over its
 * burst duration. A `"launch"` cue plans one noise voice that rises over
 * its duration — the whoosh of a shell leaving the ground.
 */
export function planVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  if (cue.kind === "burst") {
    return [
      {
        kind: "tone",
        frequencyHz: cue.spec.sound.pitch,
        frequencyEndHz: null,
        durationMs: cue.spec.burstDurationMs,
        envelope: config.audio.burst.envelope,
      },
    ];
  }
  return [
    {
      kind: "noise",
      frequencyHz: LAUNCH_START_HZ,
      frequencyEndHz: LAUNCH_END_HZ,
      durationMs: config.audio.launch.durationMs,
      envelope: config.audio.launch.envelope,
    },
  ];
}

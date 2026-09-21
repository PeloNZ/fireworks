import type { AudioVisualConfig } from "./config.ts";
import type { Cue, Voice } from "./types.ts";

/**
 * Turns a cue into the voices it should play. A `"burst"` cue plans one
 * constant-pitch tone at the firework's own pitch, decaying over its
 * burst duration. A `"launch"` cue plans nothing yet — the launch whoosh
 * arrives in cycle 20.
 */
export function planVoices(
  cue: Cue,
  config: AudioVisualConfig,
): readonly Voice[] {
  if (cue.kind !== "burst") {
    return [];
  }
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

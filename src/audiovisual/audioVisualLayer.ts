import { buildFrame } from "./frame.ts";
import { createTrails } from "./trails.ts";
import { createPhaseWatcher } from "./phases.ts";
import { createAmbient } from "./ambient.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { WorldConfig } from "../action/worldConfig.ts";
import type { AudioSink, Renderer, Voice, VoicePlanner } from "./types.ts";
import type { Firework } from "../action/types.ts";

/**
 * Wires Action's snapshot to a renderer, an audio sink, and a sound
 * set's voice planner, once per frame. Holds no clock — `elapsedMs`
 * arrives from the caller's own `requestAnimationFrame` loop, the same
 * discipline Action's `world.step` follows. It owns three pieces of state
 * across frames: a trails store for shell trails, a phase watcher for
 * sound cues, and the ambient movers that cross the sky. Which sound set
 * plays is entirely the caller's choice — this layer never imports a
 * planner itself. See docs/08_sound_effects.md. The ambient movers draw
 * their dice from `ambientRandom`, which the caller seeds, so this layer
 * reads no random source of its own either. See docs/11_ambient_movers.md.
 */
export function createAudioVisualLayer(options: {
  readonly renderer: Renderer;
  readonly audio: AudioSink;
  readonly voicePlanner: VoicePlanner;
  readonly ambientRandom: () => number;
  readonly config: AudioVisualConfig;
  readonly worldConfig: WorldConfig;
}): {
  present(input: {
    readonly entities: readonly Firework[];
    readonly alpha: number;
    readonly elapsedMs: number;
  }): void;
} {
  const { renderer, audio, voicePlanner, ambientRandom, config, worldConfig } =
    options;
  const trails = createTrails({
    maxAgeMs: config.trailMaxAgeMs,
    maxPoints: config.trailMaxPoints,
  });
  const phaseWatcher = createPhaseWatcher();
  const ambient = createAmbient({
    config: config.ambient,
    random: ambientRandom,
  });
  return {
    present(input) {
      trails.record(input.entities, input.elapsedMs);
      renderer({
        ...buildFrame({
          entities: input.entities,
          alpha: input.alpha,
          config,
          worldConfig,
          trails,
        }),
        ambient: ambient.step(input.elapsedMs),
      });

      const voices: Voice[] = [];
      for (const cue of phaseWatcher.cues(input.entities)) {
        voices.push(...voicePlanner(cue, config));
      }
      audio(voices);
    },
  };
}

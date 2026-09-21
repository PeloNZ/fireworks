import { buildFrame } from "./frame.ts";
import { createTrails } from "./trails.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { WorldConfig } from "../action/worldConfig.ts";
import type { Renderer } from "./types.ts";
import type { Firework } from "../action/types.ts";

/**
 * Wires Action's snapshot to a renderer, once per frame. Holds no clock —
 * `elapsedMs` arrives from the caller's own `requestAnimationFrame` loop,
 * the same discipline Action's `world.step` follows. Nothing reads
 * `elapsedMs` for sound yet; it's here because `present`'s shape is fixed
 * now so it never needs to change when sound cues (cycle 19) start using
 * it. It is already used to record shell trails, the one piece of state
 * this layer owns.
 */
export function createAudioVisualLayer(options: {
  readonly renderer: Renderer;
  readonly config: AudioVisualConfig;
  readonly worldConfig: WorldConfig;
}): {
  present(input: {
    readonly entities: readonly Firework[];
    readonly alpha: number;
    readonly elapsedMs: number;
  }): void;
} {
  const { renderer, config, worldConfig } = options;
  const trails = createTrails({
    maxAgeMs: config.trailMaxAgeMs,
    maxPoints: config.trailMaxPoints,
  });
  return {
    present(input) {
      trails.record(input.entities, input.elapsedMs);
      renderer(
        buildFrame({
          entities: input.entities,
          alpha: input.alpha,
          config,
          worldConfig,
          trails,
        }),
      );
    },
  };
}

import { buildFrame } from "./frame.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { Renderer } from "./types.ts";
import type { Firework } from "../action/types.ts";

/**
 * Wires Action's snapshot to a renderer, once per frame. Holds no clock —
 * `elapsedMs` arrives from the caller's own `requestAnimationFrame` loop,
 * the same discipline Action's `world.step` follows. Nothing reads
 * `elapsedMs` yet; it's here because `present`'s shape is fixed now so it
 * never needs to change when sound cues (cycle 19) start using it.
 */
export function createAudioVisualLayer(options: {
  readonly renderer: Renderer;
  readonly config: AudioVisualConfig;
}): {
  present(input: {
    readonly entities: readonly Firework[];
    readonly alpha: number;
    readonly elapsedMs: number;
  }): void;
} {
  const { renderer, config } = options;
  return {
    present(input) {
      renderer(
        buildFrame({ entities: input.entities, alpha: input.alpha, config }),
      );
    },
  };
}

import type { AudioVisualConfig } from "./config.ts";
import type { Mover } from "./types.ts";

/**
 * Rare, random movers that cross the sky. Holds the live movers across
 * frames, and nothing else: `random` is injected, and `step` receives the
 * elapsed time, so this reads no clock and never calls `Math.random`. See
 * docs/11_ambient_movers.md.
 */
export function createAmbient(options: {
  readonly config: AudioVisualConfig["ambient"];
  readonly random: () => number;
}): {
  /** Ages the live movers, removes the expired ones, maybe spawns one.
   * Returns the movers to draw this frame. */
  step(elapsedMs: number): readonly Mover[];
} {
  const { config, random } = options;
  return {
    step(elapsedMs) {
      // A rate per second, not a chance per frame, so a 144 Hz screen and a
      // 60 Hz screen spawn at the same pace.
      const chance = 1 - Math.exp((-config.ratePerSecond * elapsedMs) / 1000);
      if (random() < chance) {
        // Every spawn is a mover at the origin until the kinds exist.
        return [{ position: { x: 0, y: 0, z: 0 }, brightness: 1 }];
      }
      return [];
    },
  };
}

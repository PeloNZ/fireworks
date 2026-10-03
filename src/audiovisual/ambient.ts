import type { NumberRange } from "../action/config.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { Mover } from "./types.ts";

// One entry per kind of mover. A spawn picks one with a single draw.
const KINDS = ["shootingStar"] as const;

/** Maps the next value from `random` (in `[0, 1)`) onto `range`. One small
 * helper per file, the same as sparks.ts and backdrop.ts. */
function pickInRange(random: () => number, range: NumberRange): number {
  return range.min + random() * (range.max - range.min);
}

/** Everything a spawn drew. After that, the position is a function of
 * `ageMs` alone: nothing here reads `random` again. */
interface LiveMover {
  readonly startX: number;
  readonly startY: number;
  readonly velocityX: number; // world units per second
  readonly velocityY: number;
  ageMs: number;
}

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
  const live: LiveMover[] = [];

  // The draws are in a fixed order, so a test can script them: x, y,
  // direction, then speed.
  function spawnShootingStar(): LiveMover {
    const star = config.shootingStar;
    const startX = pickInRange(random, star.x);
    const startY = pickInRange(random, star.y);
    const direction = random() < 0.5 ? 1 : -1;
    const speed = pickInRange(random, star.speed);
    return {
      startX,
      startY,
      velocityX: direction * speed,
      velocityY: -star.descent * speed,
      ageMs: 0,
    };
  }

  return {
    step(elapsedMs) {
      for (const mover of live) {
        mover.ageMs += elapsedMs;
      }

      // A rate per second, not a chance per frame, so a 144 Hz screen and a
      // 60 Hz screen spawn at the same pace.
      const chance = 1 - Math.exp((-config.ratePerSecond * elapsedMs) / 1000);
      if (random() < chance) {
        const kind = KINDS[Math.floor(random() * KINDS.length)];
        if (kind === "shootingStar") {
          live.push(spawnShootingStar());
        }
      }

      return live.map((mover) => ({
        position: {
          x: mover.startX + (mover.velocityX * mover.ageMs) / 1000,
          y: mover.startY + (mover.velocityY * mover.ageMs) / 1000,
          z: 0,
        },
        brightness: 1,
      }));
    },
  };
}

import type { NumberRange } from "../action/config.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { Mover } from "./types.ts";

// One entry per kind of mover. A spawn picks one with a single draw.
const KINDS = ["shootingStar", "satellite"] as const satisfies readonly Kind[];
type Kind = Mover["kind"];

/** Maps the next value from `random` (in `[0, 1)`) onto `range`. One small
 * helper per file, the same as sparks.ts and backdrop.ts. */
function pickInRange(random: () => number, range: NumberRange): number {
  return range.min + random() * (range.max - range.min);
}

/** Everything a spawn drew. After that, the position is a function of
 * `ageMs` alone: nothing here reads `random` again. */
interface LiveMover {
  readonly kind: Kind;
  readonly startX: number;
  readonly startY: number;
  readonly velocityX: number; // world units per second
  readonly velocityY: number;
  readonly ttlMs: number;
  readonly brightness: number; // at age 0
  readonly fades: boolean; // true: it falls to 0 at `ttlMs`. False: it holds
  ageMs: number;
}

/**
 * Rare, random movers that cross the sky. Holds the live movers across
 * frames, and nothing else: `random` is injected, and `step` receives the
 * elapsed time, so this reads no clock and no random source of its own. See
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
  let live: LiveMover[] = [];
  // Time left before each kind may spawn again. 0 means it may spawn now.
  const cooldownLeftMs: Record<Kind, number> = {
    shootingStar: 0,
    satellite: 0,
  };

  // Left or right, from one draw.
  const pickDirection = (): 1 | -1 => (random() < 0.5 ? 1 : -1);

  // The draws are in a fixed order, so a test can script them: x, y,
  // direction, speed, then time to live.
  function spawnShootingStar(): LiveMover {
    const star = config.shootingStar;
    const startX = pickInRange(random, star.x);
    const startY = pickInRange(random, star.y);
    const direction = pickDirection();
    const speed = pickInRange(random, star.speed);
    const ttlMs = pickInRange(random, star.ttlMs);
    return {
      kind: "shootingStar",
      startX,
      startY,
      velocityX: direction * speed,
      velocityY: -star.descent * speed,
      ttlMs,
      brightness: star.brightness,
      fades: true,
      ageMs: 0,
    };
  }

  // The draws are y, direction, then speed. It starts on the edge it moves
  // away from, and it lives for as long as it takes to cross the span.
  function spawnSatellite(): LiveMover {
    const sat = config.satellite;
    const startY = pickInRange(random, sat.y);
    const direction = pickDirection();
    const speed = pickInRange(random, sat.speed);
    return {
      kind: "satellite",
      startX: direction === 1 ? sat.x.min : sat.x.max,
      startY,
      velocityX: direction * speed,
      velocityY: 0,
      ttlMs: ((sat.x.max - sat.x.min) / speed) * 1000,
      brightness: sat.brightness,
      fades: false,
      ageMs: 0,
    };
  }

  return {
    step(elapsedMs) {
      for (const mover of live) {
        mover.ageMs += elapsedMs;
      }
      live = live.filter((mover) => mover.ageMs < mover.ttlMs);
      for (const kind of KINDS) {
        cooldownLeftMs[kind] = Math.max(0, cooldownLeftMs[kind] - elapsedMs);
      }

      // A rate per second, not a chance per frame, so a 144 Hz screen and a
      // 60 Hz screen spawn at the same pace.
      const chance = 1 - Math.exp((-config.ratePerSecond * elapsedMs) / 1000);
      if (live.length < config.maxLive && random() < chance) {
        const kind = KINDS[Math.floor(random() * KINDS.length)];
        if (kind !== undefined && cooldownLeftMs[kind] === 0) {
          live.push(
            kind === "shootingStar" ? spawnShootingStar() : spawnSatellite(),
          );
          cooldownLeftMs[kind] = config.cooldownMs;
        }
      }

      return live.map((mover) => ({
        kind: mover.kind,
        position: {
          x: mover.startX + (mover.velocityX * mover.ageMs) / 1000,
          y: mover.startY + (mover.velocityY * mover.ageMs) / 1000,
          z: 0,
        },
        brightness: mover.fades
          ? mover.brightness * (1 - mover.ageMs / mover.ttlMs)
          : mover.brightness,
      }));
    },
  };
}

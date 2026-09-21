import type { ActionConfig, NumberRange } from "./config.ts";
import { createRandom } from "./random.ts";
import type { Seeds, Vec3 } from "./types.ts";

/** Maps the next value from `random` (in `[0, 1)`) onto `range`. */
function pick(random: () => number, range: NumberRange): number {
  return range.min + random() * (range.max - range.min);
}

/** What a key press decides about a firework's launch. */
export interface Launch {
  readonly velocity: Vec3;
  readonly thrust: number;
  readonly fuelMs: number;
  readonly fuseMs: number;
}

/**
 * Turns a Seeds pair into launch values. Angle comes from `seeds.key`
 * alone, so one physical key always launches on the same line — pressing
 * the same key twice feels like the same key. Everything else — speed,
 * thrust, fuel, fuse — comes from `seeds.press`, so how hard and how far it
 * goes still varies every time. See "Seeded randomness" in
 * docs/04_plan_action_layer.md.
 */
export function pickLaunch(seeds: Seeds, config: ActionConfig): Launch {
  const angleDegrees = pick(createRandom(seeds.key), config.launchAngle);
  const angleRadians = (angleDegrees * Math.PI) / 180;

  const pressRandom = createRandom(seeds.press);
  const speed = pick(pressRandom, config.launchSpeed);
  const thrust = pick(pressRandom, config.thrust);
  const fuelMs = pick(pressRandom, config.fuelMs);
  const fuseMs = pick(pressRandom, config.fuseMs);

  return {
    velocity: {
      x: speed * Math.sin(angleRadians),
      y: speed * Math.cos(angleRadians),
      z: 0,
    },
    thrust,
    fuelMs,
    fuseMs,
  };
}

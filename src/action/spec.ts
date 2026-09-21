import type { ActionConfig, NumberRange } from "./config.ts";
import { createRandom, deriveSeeds, hashString } from "./random.ts";
import { pickLaunch } from "./launch.ts";
import { pickPalette, pickPattern, pickSound } from "./traits.ts";
import type { ControlSignal } from "../control/types.ts";
import type { FireworkSpec } from "./types.ts";

/** Maps the next value from `random` (in `[0, 1)`) onto `range`. Same idea
 * as launch.ts's and traits.ts's private `pick`/`pickInRange` — kept local
 * here too, one small helper per file rather than a shared module for
 * something this small. */
function pickInRange(random: () => number, range: NumberRange): number {
  return range.min + random() * (range.max - range.min);
}

/**
 * Assembles the full recipe from every trait picker built in cycles 1-8.
 * Pure: the same signal and config always produce a deep-equal spec — no
 * clock read, no stored state — which is what makes a firework replayable
 * from its spec alone.
 *
 * `particleCount` and `burstDurationMs` need their own randomness, but
 * reusing `seeds.press` here (via a fresh `createRandom(seeds.press)`)
 * would restart that generator's sequence from scratch and draw the exact
 * same first fraction `pickLaunch` already used for speed — correlating
 * two fields that should vary independently. Hashing in a distinguishing
 * suffix gives this step its own seed instead.
 */
export function buildFireworkSpec(
  signal: ControlSignal,
  config: ActionConfig,
): FireworkSpec {
  const seeds = deriveSeeds(signal);
  const launch = pickLaunch(seeds, config);
  const pattern = pickPattern(seeds, config);
  const colors = pickPalette(seeds, config);
  const sound = pickSound(seeds, config);

  const detailsSeed = hashString(
    `${signal.id}:${Math.floor(signal.timestamp).toString()}:details`,
  );
  const detailsRandom = createRandom(detailsSeed);
  const particleCount = pickInRange(detailsRandom, config.particleCount);
  const burstDurationMs = pickInRange(detailsRandom, config.burstDurationMs);

  return {
    id: `${signal.id}:${Math.floor(signal.timestamp).toString()}`,
    launchedAt: signal.timestamp,
    origin: config.launchOrigin,
    velocity: launch.velocity,
    thrust: launch.thrust,
    fuelMs: launch.fuelMs,
    fuseMs: launch.fuseMs,
    pattern,
    colors,
    particleCount,
    burstDurationMs,
    sound,
    seed: seeds.press,
  };
}

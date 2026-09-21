import type { ActionConfig } from "./config.ts";
import { createRandom } from "./random.ts";
import type { FireworkPattern, Seeds } from "./types.ts";

/**
 * Picks a burst pattern from `config.patterns`, stable per key seed —
 * one physical key always shows the same pattern, the same way one key
 * always launches on the same line (see `pickLaunch`).
 */
export function pickPattern(
  seeds: Seeds,
  config: ActionConfig,
): FireworkPattern {
  const random = createRandom(seeds.key);
  const index = Math.floor(random() * config.patterns.length);
  const pattern = config.patterns[index];
  if (!pattern) {
    // config.patterns is contractually non-empty — a real config always
    // lists at least one pattern — so this only fires if that contract is
    // broken. noUncheckedIndexedAccess can't see that guarantee, so it
    // types this access as possibly undefined regardless.
    throw new Error("ActionConfig.patterns must not be empty");
  }
  return pattern;
}

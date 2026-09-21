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

/**
 * Picks `config.paletteSize` colours from one colour family in
 * `config.palettes`. Which family comes from the key seed — stable per
 * physical key, same idea as `pickPattern`. Which colours within that
 * family comes from the press seed, drawn without repeats by a Fisher-Yates
 * shuffle so two presses of the same key show the same family in different
 * combinations, never the exact same set twice in a row by construction
 * alone (though a repeat is still possible by chance, same as any seeded
 * draw).
 */
export function pickPalette(
  seeds: Seeds,
  config: ActionConfig,
): readonly string[] {
  const familyRandom = createRandom(seeds.key);
  const familyIndex = Math.floor(familyRandom() * config.palettes.length);
  const family = config.palettes[familyIndex];
  if (!family) {
    // Same contract as pickPattern's guard above: config.palettes is
    // assumed non-empty by a real config.
    throw new Error("ActionConfig.palettes must not be empty");
  }

  const pressRandom = createRandom(seeds.press);
  const shuffled = [...family];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(pressRandom() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a === undefined || b === undefined) {
      // Unreachable: i and j are always valid indices into shuffled, which
      // never shrinks. noUncheckedIndexedAccess can't see that, so it types
      // both reads as possibly undefined regardless.
      throw new Error("unreachable: shuffle index out of range");
    }
    shuffled[i] = b;
    shuffled[j] = a;
  }
  return shuffled.slice(0, config.paletteSize);
}

import { describe, expect, it } from "vitest";
import { defaultActionConfig } from "./config.ts";
import { pickPalette, pickPattern } from "./traits.ts";
import type { Seeds } from "./types.ts";

// Cycle 6 (docs/04_plan_action_layer.md): pickPattern is the first of three
// cosmetic trait pickers. It's stable per key seed, same idea as the angle
// half of pickLaunch — one key always shows the same pattern.

function seeds(overrides: Partial<Seeds> = {}): Seeds {
  return { key: 1, press: 2, ...overrides };
}

describe("pickPattern", () => {
  it("is stable for one key seed across many calls", () => {
    const first = pickPattern(seeds({ key: 7 }), defaultActionConfig);

    for (let i = 0; i < 10; i++) {
      expect(pickPattern(seeds({ key: 7 }), defaultActionConfig)).toBe(first);
    }
  });

  it("always returns a member of config.patterns", () => {
    const pattern = pickPattern(seeds(), defaultActionConfig);

    expect(defaultActionConfig.patterns).toContain(pattern);
  });

  it("returns the only pattern when the config holds a single one", () => {
    const config = { ...defaultActionConfig, patterns: ["willow"] as const };

    expect(pickPattern(seeds({ key: 99 }), config)).toBe("willow");
  });

  it("draws from each config's own pattern list", () => {
    const configA = { ...defaultActionConfig, patterns: ["peony"] as const };
    const configB = { ...defaultActionConfig, patterns: ["ring"] as const };

    expect(pickPattern(seeds(), configA)).toBe("peony");
    expect(pickPattern(seeds(), configB)).toBe("ring");
  });
});

// Cycle 7 (docs/04_plan_action_layer.md): pickPalette. Families are made
// several times larger than paletteSize in defaultActionConfig precisely
// so "different colours per press" isn't a coin flip — see the plan's note
// on picking fixture seeds after seeing real output, not before.

describe("pickPalette", () => {
  it("selects the same colour family for the same key seed, whatever the press seed", () => {
    const a = pickPalette(seeds({ key: 5, press: 1 }), defaultActionConfig);
    const b = pickPalette(seeds({ key: 5, press: 2 }), defaultActionConfig);

    const familyContaining = (colors: readonly string[]) =>
      defaultActionConfig.palettes.find((family) =>
        family.includes(colors[0] ?? ""),
      );

    expect(familyContaining(a)).toBe(familyContaining(b));
  });

  it("draws different colours for a different press seed, same key seed", () => {
    const a = pickPalette(seeds({ key: 5, press: 1 }), defaultActionConfig);
    const b = pickPalette(seeds({ key: 5, press: 2 }), defaultActionConfig);

    expect(a).not.toEqual(b);
  });

  it("returns exactly config.paletteSize colours", () => {
    const result = pickPalette(seeds(), defaultActionConfig);

    expect(result).toHaveLength(defaultActionConfig.paletteSize);
  });

  it("returns only colours that exist in the chosen family", () => {
    const result = pickPalette(seeds(), defaultActionConfig);
    const chosenFamily = defaultActionConfig.palettes.find((family) =>
      family.includes(result[0] ?? ""),
    );

    expect(chosenFamily).toBeDefined();
    for (const color of result) {
      expect(chosenFamily).toContain(color);
    }
  });
});

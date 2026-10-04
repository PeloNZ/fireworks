import { describe, expect, it } from "vitest";
import { defaultSettings } from "../config.ts";
import { pickPalette, pickPattern, pickSound } from "./traits.ts";
import type { Seeds } from "./types.ts";

// Cycle 6 (docs/04_plan_action_layer.md): pickPattern is the first of three
// cosmetic trait pickers. It's stable per key seed, same idea as the angle
// half of pickLaunch — one key always shows the same pattern.

function seeds(overrides: Partial<Seeds> = {}): Seeds {
  return { key: 1, press: 2, ...overrides };
}

describe("pickPattern", () => {
  it("is stable for one key seed across many calls", () => {
    const first = pickPattern(seeds({ key: 7 }), defaultSettings.action);

    for (let i = 0; i < 10; i++) {
      expect(pickPattern(seeds({ key: 7 }), defaultSettings.action)).toBe(
        first,
      );
    }
  });

  it("always returns a member of config.patterns", () => {
    const pattern = pickPattern(seeds(), defaultSettings.action);

    expect(defaultSettings.action.patterns).toContain(pattern);
  });

  it("returns the only pattern when the config holds a single one", () => {
    const config = { ...defaultSettings.action, patterns: ["willow"] as const };

    expect(pickPattern(seeds({ key: 99 }), config)).toBe("willow");
  });

  it("draws from each config's own pattern list", () => {
    const configA = { ...defaultSettings.action, patterns: ["peony"] as const };
    const configB = { ...defaultSettings.action, patterns: ["ring"] as const };

    expect(pickPattern(seeds(), configA)).toBe("peony");
    expect(pickPattern(seeds(), configB)).toBe("ring");
  });
});

// Cycle 7 (docs/04_plan_action_layer.md): pickPalette. Families are made
// several times larger than paletteSize in defaultSettings.action precisely
// so "different colours per press" isn't a coin flip — see the plan's note
// on picking fixture seeds after seeing real output, not before.

describe("pickPalette", () => {
  it("selects the same colour family for the same key seed, whatever the press seed", () => {
    const a = pickPalette(seeds({ key: 5, press: 1 }), defaultSettings.action);
    const b = pickPalette(seeds({ key: 5, press: 2 }), defaultSettings.action);

    const familyContaining = (colors: readonly string[]) =>
      defaultSettings.action.palettes.find((family) =>
        family.includes(colors[0] ?? ""),
      );

    expect(familyContaining(a)).toBe(familyContaining(b));
  });

  it("draws different colours for a different press seed, same key seed", () => {
    const a = pickPalette(seeds({ key: 5, press: 1 }), defaultSettings.action);
    const b = pickPalette(seeds({ key: 5, press: 2 }), defaultSettings.action);

    expect(a).not.toEqual(b);
  });

  it("returns exactly config.paletteSize colours", () => {
    const result = pickPalette(seeds(), defaultSettings.action);

    expect(result).toHaveLength(defaultSettings.action.paletteSize);
  });

  it("returns only colours that exist in the chosen family", () => {
    const result = pickPalette(seeds(), defaultSettings.action);
    const chosenFamily = defaultSettings.action.palettes.find((family) =>
      family.includes(result[0] ?? ""),
    );

    expect(chosenFamily).toBeDefined();
    for (const color of result) {
      expect(chosenFamily).toContain(color);
    }
  });
});

// Cycle 8 (docs/04_plan_action_layer.md): pickSound. Both fields are
// stable per key seed — a firework's sound, like its pattern, is part of
// what makes pressing the same key feel like that key.

describe("pickSound", () => {
  it("gives a stable pitch for one key seed across many calls", () => {
    const first = pickSound(seeds({ key: 3 }), defaultSettings.action).pitch;

    for (let i = 0; i < 10; i++) {
      expect(pickSound(seeds({ key: 3 }), defaultSettings.action).pitch).toBe(
        first,
      );
    }
  });

  it("keeps pitch inside an unusual configured range", () => {
    const config = {
      ...defaultSettings.action,
      sound: {
        ...defaultSettings.action.sound,
        pitch: { min: 5000, max: 5001 },
      },
    };

    const { pitch } = pickSound(seeds(), config);

    expect(pitch).toBeGreaterThanOrEqual(5000);
    expect(pitch).toBeLessThanOrEqual(5001);
  });

  it("gives a stable timbre for one key seed, always a member of config.sound.timbres", () => {
    const first = pickSound(seeds({ key: 4 }), defaultSettings.action).timbre;

    expect(defaultSettings.action.sound.timbres).toContain(first);
    for (let i = 0; i < 10; i++) {
      expect(pickSound(seeds({ key: 4 }), defaultSettings.action).timbre).toBe(
        first,
      );
    }
  });
});

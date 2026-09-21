import { describe, expect, it } from "vitest";
import { defaultActionConfig } from "./config.ts";
import { pickPattern } from "./traits.ts";
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

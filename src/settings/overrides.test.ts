import { describe, expect, it } from "vitest";
import { mergeOverrides } from "./overrides.ts";

// Cycle 2 (docs/13_settings_overrides.md): a saved value replaces its default.
// The defaults here are small made-up objects with unusual numbers, so a
// hard-coded answer cannot pass.
describe("mergeOverrides: a saved value replaces its default", () => {
  it("replaces a number and keeps the rest", () => {
    const defaults = { drag: 0.3, stepMs: 8 };

    expect(mergeOverrides(defaults, { drag: 0.77 })).toEqual({
      drag: 0.77,
      stepMs: 8,
    });
  });

  it("replaces one nested number and keeps its siblings", () => {
    const defaults = {
      world: { gravity: { x: 0, y: -18, z: 0 }, drag: 0.3 },
      sound: "tones",
    };

    expect(
      mergeOverrides(defaults, { world: { gravity: { y: -4.5 } } }),
    ).toEqual({
      world: { gravity: { x: 0, y: -4.5, z: 0 }, drag: 0.3 },
      sound: "tones",
    });
  });
});

import { describe, expect, it } from "vitest";
import { skyBrightnessAt } from "./backdrop.ts";
import type { SkyGradient } from "./types.ts";

// Cycle 1 (docs/06_world_backdrop.md): the sky gradient as a plain
// function of world height. Two ends and a straight line between them —
// the same linear interpolation lerpVec3 does for a shell's position,
// applied to one number instead of three.

describe("skyBrightnessAt", () => {
  // Neither end is a config default, so a hardcoded brightness fails, and
  // the two differ enough that a gradient interpolated the wrong way round
  // fails everywhere except the midpoint.
  const sky: SkyGradient = { horizon: 0.4, zenith: 0.1 };

  it("returns the horizon's brightness at the bottom of world space", () => {
    expect(skyBrightnessAt(sky, 0)).toBeCloseTo(0.4);
  });

  it("returns the zenith's brightness at the top of world space", () => {
    expect(skyBrightnessAt(sky, 100)).toBeCloseTo(0.1);
  });

  it("returns the exact midpoint halfway up", () => {
    expect(skyBrightnessAt(sky, 50)).toBeCloseTo(0.25);
  });

  it("interpolates proportionally at a height that is not the midpoint", () => {
    // A quarter of the way up: 0.4 + (0.1 - 0.4) * 0.25. Driven off the
    // midpoint so an implementation that always blends half and half fails.
    expect(skyBrightnessAt(sky, 25)).toBeCloseTo(0.325);
  });
});

import { describe, expect, it } from "vitest";
import { add, magnitude, normalise, scale } from "./vector.ts";
import type { Vec3 } from "./types.ts";

// Cycle 4 (docs/04_plan_action_layer.md): the small vector library
// stepPhysics is built on. Each function is a one-line check against
// hand-checked numbers, except normalise, which gets a second case: the
// zero vector, the one input that would otherwise silently produce NaN
// and poison every position computed from it afterward.

describe("add", () => {
  it("adds two vectors component-wise", () => {
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: 10, y: 20, z: 30 };

    expect(add(a, b)).toEqual({ x: 11, y: 22, z: 33 });
  });
});

describe("scale", () => {
  it("multiplies every component by a scalar", () => {
    const v: Vec3 = { x: 1, y: -2, z: 3 };

    expect(scale(v, 2)).toEqual({ x: 2, y: -4, z: 6 });
  });
});

describe("magnitude", () => {
  it("returns the vector's length", () => {
    expect(magnitude({ x: 3, y: 4, z: 0 })).toBe(5);
  });

  it("returns 0 for the zero vector", () => {
    expect(magnitude({ x: 0, y: 0, z: 0 })).toBe(0);
  });
});

describe("normalise", () => {
  it("returns a unit vector pointing the same direction", () => {
    const result = normalise({ x: 3, y: 4, z: 0 });

    expect(result.x).toBeCloseTo(0.6);
    expect(result.y).toBeCloseTo(0.8);
    expect(result.z).toBe(0);
    expect(magnitude(result)).toBeCloseTo(1);
  });

  it("returns the zero vector for the zero vector, not NaN", () => {
    expect(normalise({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});

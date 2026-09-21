import { describe, expect, it } from "vitest";
import { lerpVec3 } from "./interpolate.ts";
import type { Vec3 } from "../action/types.ts";

// Cycle 2 (docs/05_audio_visual_layer.md): buildFrame positions every
// sprite by interpolating between a firework's previousPosition and
// position, using world.alpha(), so motion stays smooth between Action's
// fixed physics steps regardless of the screen's refresh rate.

describe("lerpVec3", () => {
  it("returns a at alpha 0", () => {
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: 10, y: 20, z: 30 };

    expect(lerpVec3(a, b, 0)).toEqual(a);
  });

  it("returns b at alpha 1", () => {
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: 10, y: 20, z: 30 };

    expect(lerpVec3(a, b, 1)).toEqual(b);
  });

  it("returns the exact midpoint at alpha 0.5", () => {
    const a: Vec3 = { x: 0, y: 0, z: 0 };
    const b: Vec3 = { x: 10, y: 20, z: 30 };

    expect(lerpVec3(a, b, 0.5)).toEqual({ x: 5, y: 10, z: 15 });
  });

  it("interpolates each axis independently", () => {
    // y is identical on both ends, so if the implementation collapsed all
    // three axes onto one shared fraction, y would still happen to pass —
    // x and z, which actually move, are what this case is checking.
    const a: Vec3 = { x: 0, y: 100, z: 0 };
    const b: Vec3 = { x: 100, y: 100, z: 100 };

    expect(lerpVec3(a, b, 0.25)).toEqual({ x: 25, y: 100, z: 25 });
  });
});

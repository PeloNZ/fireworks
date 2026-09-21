import type { Vec3 } from "./types.ts";

/** Adds two vectors component-wise. Pure — no vector here is ever mutated. */
export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Multiplies every component of `v` by `factor`. */
export function scale(v: Vec3, factor: number): Vec3 {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

/** The vector's length. */
export function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * A unit vector pointing the same direction as `v`. The zero vector has no
 * direction to point in, so it returns the zero vector rather than dividing
 * by zero and producing `NaN` — the one input that would otherwise silently
 * poison every position computed downstream of it.
 */
export function normalise(v: Vec3): Vec3 {
  const length = magnitude(v);
  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return scale(v, 1 / length);
}

import type { Vec3 } from "../action/types.ts";

/**
 * Linearly interpolates between two points. `alpha` of `0` returns `a`,
 * `1` returns `b`, and anything between blends the two proportionally.
 */
export function lerpVec3(a: Vec3, b: Vec3, alpha: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
    z: a.z + (b.z - a.z) * alpha,
  };
}

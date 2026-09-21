import type { Firework, FireworkSpec } from "./types.ts";

/**
 * Builds the live `Firework` from a `FireworkSpec` — a snapshot at t=0,
 * before any physics or phase step has run. `position` and
 * `previousPosition` start equal, since nothing has moved yet; they only
 * diverge once `stepPhysics` runs (see docs/04_plan_action_layer.md's
 * "Fixed timestep" for why both are kept).
 */
export function createFirework(spec: FireworkSpec): Firework {
  return {
    spec,
    phase: "armed",
    position: spec.origin,
    previousPosition: spec.origin,
    velocity: spec.velocity,
    fuelRemainingMs: spec.fuelMs,
    fuseRemainingMs: spec.fuseMs,
    phaseElapsedMs: 0,
  };
}

import type { ActionConfig } from "./config.ts";
import { stepPhase } from "./phase.ts";
import { stepPhysics } from "./physics.ts";
import type { Firework, FireworkSpec } from "./types.ts";
import type { WorldConfig } from "./worldConfig.ts";

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

// Physics only applies while a firework has actually launched and hasn't
// finished — see "The state machine" rule 4 in docs/04_plan_action_layer.md.
// Checked against the phase *before* this tick's stepPhase call, so a
// firework that transitions into "flying" this tick doesn't get pushed by
// gravity until the next one — same one-transition-per-tick granularity
// stepPhase itself uses.
const PHYSICS_PHASES = new Set(["launching", "flying", "exploding"]);

/**
 * Creates the live simulation: a set of fireworks, stepped on a fixed
 * timestep. `step(elapsedMs)` accumulates real elapsed time and runs as
 * many `worldConfig.stepMs`-sized ticks as are due, carrying the remainder
 * forward — see "Fixed timestep" in docs/04_plan_action_layer.md for why:
 * determinism, stability, and testability all depend on never integrating
 * with a variable dt.
 */
export function createWorld(options: {
  readonly worldConfig: WorldConfig;
  readonly config: ActionConfig;
}) {
  const { worldConfig, config } = options;
  let fireworks: Firework[] = [];
  let accumulatorMs = 0;

  function tick(firework: Firework): Firework {
    const afterPhysics = PHYSICS_PHASES.has(firework.phase)
      ? stepPhysics(firework, worldConfig, worldConfig.stepMs)
      : firework;
    return stepPhase(afterPhysics, config, worldConfig.stepMs);
  }

  return {
    /** Adds a new firework to the simulation, built from `spec`. */
    spawn(spec: FireworkSpec): void {
      fireworks.push(createFirework(spec));
    },

    /** Advances the simulation by `elapsedMs` of real time, running zero
     * or more fixed-size ticks. `finished` fireworks are removed at the
     * end of each tick they reach it in. */
    step(elapsedMs: number): void {
      accumulatorMs += elapsedMs;
      while (accumulatorMs >= worldConfig.stepMs) {
        fireworks = fireworks
          .map(tick)
          .filter((firework) => firework.phase !== "finished");
        accumulatorMs -= worldConfig.stepMs;
      }
    },

    /** The live fireworks, oldest first. Returns a copy — mutating the
     * result never touches stored state, the same guarantee
     * `createHistory.recent()` gives in the Control layer. */
    entities(): readonly Firework[] {
      return [...fireworks];
    },

    /** The leftover fraction of a step, in `[0, 1)` — for the renderer to
     * interpolate between a firework's `previousPosition` and `position`. */
    alpha(): number {
      return accumulatorMs / worldConfig.stepMs;
    },
  };
}

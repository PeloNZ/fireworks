import type { ActionConfig } from "./config.ts";
import type { Firework, FireworkPhase } from "./types.ts";

/**
 * Advances the state machine by one fixed step, and — per the note added
 * to `stepPhysics`'s cycle in docs/04_plan_action_layer.md — counts
 * `fuelRemainingMs` and `fuseRemainingMs` down. `stepPhysics` only reads
 * those values; this is the one place they change. See "The state
 * machine" in docs/04_plan_action_layer.md for the phase rules.
 *
 * The fuse is checked independently of every other timer, in every phase
 * except `exploding` and `finished` — a burst can end `armed`, `launching`
 * or `flying` early, which is the whole reason fuse is a separate field
 * from fuel rather than "burst when fuel runs out."
 */
export function stepPhase(
  firework: Firework,
  config: ActionConfig,
  dtMs: number,
): Firework {
  const fuelRemainingMs = Math.max(0, firework.fuelRemainingMs - dtMs);
  const fuseRemainingMs = Math.max(0, firework.fuseRemainingMs - dtMs);
  const phaseElapsedMs = firework.phaseElapsedMs + dtMs;

  let phase: FireworkPhase = firework.phase;
  let elapsed = phaseElapsedMs;

  const halfLaunch = config.launchDurationMs / 2;

  switch (phase) {
    case "armed":
      if (elapsed >= halfLaunch) {
        phase = "launching";
        elapsed = 0;
      }
      break;
    case "launching":
      if (elapsed >= halfLaunch) {
        phase = "flying";
        elapsed = 0;
      }
      break;
    case "flying":
      // No duration-based exit — only the fuse check below ends this phase.
      break;
    case "exploding":
      if (elapsed >= firework.spec.burstDurationMs) {
        phase = "finished";
        elapsed = 0;
      }
      break;
    case "finished":
      break;
  }

  if (fuseRemainingMs <= 0 && phase !== "exploding" && phase !== "finished") {
    phase = "exploding";
    elapsed = 0;
  }

  return {
    ...firework,
    phase,
    phaseElapsedMs: elapsed,
    fuelRemainingMs,
    fuseRemainingMs,
  };
}

import type { Firework, FireworkPhase } from "../action/types.ts";
import type { Cue } from "./types.ts";

/**
 * Watches Action's phase machine and turns a transition into a cue —
 * entering `"launching"` gives `"launch"`, entering `"exploding"` gives
 * `"burst"`. Reads a fact Action already decided; derives nothing new.
 * The first sighting of a firework gives no cue (there's no prior phase
 * to compare against), and an id absent from a call is forgotten
 * entirely — its return, if it ever returns, is treated as a first
 * sighting again, not a transition from wherever it left off.
 */
export function createPhaseWatcher(): {
  cues(entities: readonly Firework[]): readonly Cue[];
} {
  const lastPhase = new Map<string, FireworkPhase>();

  return {
    cues(entities): readonly Cue[] {
      const liveIds = new Set(entities.map((firework) => firework.spec.id));
      for (const id of lastPhase.keys()) {
        if (!liveIds.has(id)) {
          lastPhase.delete(id);
        }
      }

      const cues: Cue[] = [];
      for (const firework of entities) {
        const previous = lastPhase.get(firework.spec.id);
        lastPhase.set(firework.spec.id, firework.phase);

        if (previous === undefined || previous === firework.phase) {
          continue;
        }
        if (firework.phase === "launching") {
          cues.push({ kind: "launch", spec: firework.spec });
        } else if (firework.phase === "exploding") {
          cues.push({ kind: "burst", spec: firework.spec });
        }
      }
      return cues;
    },
  };
}

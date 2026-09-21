import type { Firework, Vec3 } from "../action/types.ts";

interface StoredPoint {
  readonly position: Vec3;
  ageMs: number;
}

/**
 * A bounded, aged store of recent positions per firework, keyed by
 * `spec.id`. Unlike a spark's position, a shell's real trajectory has no
 * closed form to re-evaluate at an earlier time — its thrust, fuel and
 * wind make its past positions unpredictable from its current one — so
 * this is the one place in the layer that keeps state across frames.
 *
 * Ages are tracked in milliseconds, not frames, so a trail's length in
 * real time is the same on a 144Hz monitor as a 60Hz one.
 */
export function createTrails(options: {
  readonly maxAgeMs: number;
  readonly maxPoints: number;
}): {
  record(entities: readonly Firework[], elapsedMs: number): void;
  points(specId: string): readonly { position: Vec3; ageMs: number }[];
} {
  const { maxAgeMs, maxPoints } = options;
  const store = new Map<string, StoredPoint[]>();

  return {
    /**
     * Ages every stored point by `elapsedMs`, drops any now past
     * `maxAgeMs`, forgets any id no longer present in `entities` entirely
     * (rather than leaving it to age out with no new point to trigger
     * that), then appends the current position for each firework given,
     * dropping the oldest point first if that goes over `maxPoints`.
     */
    record(entities, elapsedMs): void {
      const liveIds = new Set(entities.map((firework) => firework.spec.id));
      for (const id of store.keys()) {
        if (!liveIds.has(id)) {
          store.delete(id);
        }
      }

      for (const [id, points] of store) {
        const aged = points
          .map((point) => ({
            position: point.position,
            ageMs: point.ageMs + elapsedMs,
          }))
          .filter((point) => point.ageMs <= maxAgeMs);
        store.set(id, aged);
      }

      for (const firework of entities) {
        const points = store.get(firework.spec.id) ?? [];
        points.push({ position: firework.position, ageMs: 0 });
        if (points.length > maxPoints) {
          points.splice(0, points.length - maxPoints);
        }
        store.set(firework.spec.id, points);
      }
    },

    /** Stored points for one firework, newest first. A copy — mutating
     * the result does not change stored state. */
    points(specId): readonly { position: Vec3; ageMs: number }[] {
      const stored = store.get(specId) ?? [];
      return [...stored].reverse();
    },
  };
}

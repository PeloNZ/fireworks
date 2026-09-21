import { describe, expect, it } from "vitest";
import { createTrails } from "./trails.ts";
import type { Firework, FireworkSpec, Vec3 } from "../action/types.ts";

// Cycle 14 (docs/05_audio_visual_layer.md): a shell's trail, unlike a
// spark's, has no closed form to fall back on — a shell's real physics
// (thrust, fuel, wind) makes its own past positions unpredictable from the
// current one. So this one piece of the layer keeps state: recent
// positions per firework, aged in milliseconds (not frames), so a trail's
// length in real time doesn't change with the screen's refresh rate.
// Mirrors createHistory's shape (src/control/history.ts), not its code —
// createHistory ages at read time from an injected clock; this ages at
// write time from the caller's own elapsedMs, since a trail point has no
// absolute timestamp to compare against later.

function fireworkSpec(id: string): FireworkSpec {
  return {
    id,
    launchedAt: 0,
    origin: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 10, z: 0 },
    thrust: 0,
    fuelMs: 500,
    fuseMs: 900,
    pattern: "peony",
    colors: ["#ff3b30"],
    particleCount: 60,
    burstDurationMs: 300,
    sound: { pitch: 440, timbre: "soft" },
    seed: 1,
  };
}

function firework(id: string, position: Vec3): Firework {
  return {
    spec: fireworkSpec(id),
    phase: "flying",
    position,
    previousPosition: position,
    velocity: { x: 0, y: 0, z: 0 },
    fuelRemainingMs: 0,
    fuseRemainingMs: 0,
    phaseElapsedMs: 0,
  };
}

describe("createTrails", () => {
  it("records the current position at age 0", () => {
    const trails = createTrails({ maxAgeMs: 1000, maxPoints: 10 });

    trails.record([firework("a", { x: 1, y: 2, z: 0 })], 0);

    expect(trails.points("a")).toEqual([
      { position: { x: 1, y: 2, z: 0 }, ageMs: 0 },
    ]);
  });

  it("returns points newest first, ageing earlier ones by elapsedMs", () => {
    const trails = createTrails({ maxAgeMs: 1000, maxPoints: 10 });

    trails.record([firework("a", { x: 0, y: 0, z: 0 })], 0);
    trails.record([firework("a", { x: 1, y: 0, z: 0 })], 10);

    expect(trails.points("a")).toEqual([
      { position: { x: 1, y: 0, z: 0 }, ageMs: 0 },
      { position: { x: 0, y: 0, z: 0 }, ageMs: 10 },
    ]);
  });

  it("caps at maxPoints, dropping the oldest first", () => {
    const trails = createTrails({ maxAgeMs: 1000, maxPoints: 2 });

    trails.record([firework("a", { x: 0, y: 0, z: 0 })], 0);
    trails.record([firework("a", { x: 1, y: 0, z: 0 })], 10);
    trails.record([firework("a", { x: 2, y: 0, z: 0 })], 10);

    expect(trails.points("a").map((p) => p.position.x)).toEqual([2, 1]);
  });

  it("drops points older than maxAgeMs, aged across successive record calls", () => {
    const trails = createTrails({ maxAgeMs: 15, maxPoints: 10 });

    trails.record([firework("a", { x: 0, y: 0, z: 0 })], 0); // age 0
    trails.record([firework("a", { x: 1, y: 0, z: 0 })], 10); // first ages to 10; new at 0
    trails.record([firework("a", { x: 2, y: 0, z: 0 })], 10); // first ages to 20 (>15, dropped)

    expect(trails.points("a").map((p) => p.position.x)).toEqual([2, 1]);
  });

  it("forgets an id immediately once it's absent from entities, not left to age out", () => {
    const trails = createTrails({ maxAgeMs: 1000, maxPoints: 10 });

    trails.record([firework("a", { x: 0, y: 0, z: 0 })], 0);
    trails.record([], 1); // "a" is gone, well within maxAgeMs

    expect(trails.points("a")).toEqual([]);
  });

  it("keeps two fireworks' trails independent", () => {
    const trails = createTrails({ maxAgeMs: 1000, maxPoints: 10 });

    trails.record(
      [
        firework("a", { x: 1, y: 0, z: 0 }),
        firework("b", { x: 2, y: 0, z: 0 }),
      ],
      0,
    );

    expect(trails.points("a")).toEqual([
      { position: { x: 1, y: 0, z: 0 }, ageMs: 0 },
    ]);
    expect(trails.points("b")).toEqual([
      { position: { x: 2, y: 0, z: 0 }, ageMs: 0 },
    ]);
  });

  it("returns an empty list for an id never recorded", () => {
    const trails = createTrails({ maxAgeMs: 1000, maxPoints: 10 });

    expect(trails.points("never-seen")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { createPhaseWatcher } from "./phases.ts";
import type { Firework, FireworkSpec } from "../action/types.ts";

// Cycle 16 (docs/05_audio_visual_layer.md): rendering redraws everything
// from scratch every frame; sound needs a discrete "this just happened."
// createPhaseWatcher turns Action's continuous phase into cues by
// remembering what it saw last time — reading a fact Action already
// decided, not deriving a new one.

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

function firework(
  id: string,
  phase: Firework["phase"],
  spec: FireworkSpec = fireworkSpec(id),
): Firework {
  return {
    spec,
    phase,
    position: { x: 0, y: 0, z: 0 },
    previousPosition: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    fuelRemainingMs: 0,
    fuseRemainingMs: 0,
    phaseElapsedMs: 0,
  };
}

describe("createPhaseWatcher", () => {
  it("gives no cue on first sighting of a firework, whatever its phase", () => {
    const watcher = createPhaseWatcher();

    expect(watcher.cues([firework("a", "armed")])).toEqual([]);
  });

  it("gives a launch cue when a firework enters launching", () => {
    const watcher = createPhaseWatcher();
    const spec = fireworkSpec("a");
    watcher.cues([firework("a", "armed", spec)]);

    const cues = watcher.cues([firework("a", "launching", spec)]);

    expect(cues).toEqual([{ kind: "launch", spec }]);
  });

  it("gives a burst cue when a firework enters exploding", () => {
    const watcher = createPhaseWatcher();
    const spec = fireworkSpec("a");
    watcher.cues([firework("a", "flying", spec)]);

    const cues = watcher.cues([firework("a", "exploding", spec)]);

    expect(cues).toEqual([{ kind: "burst", spec }]);
  });

  it("gives a flight cue when a firework enters flying", () => {
    const watcher = createPhaseWatcher();
    const spec = fireworkSpec("a");
    watcher.cues([firework("a", "launching", spec)]);

    const cues = watcher.cues([firework("a", "flying", spec)]);

    expect(cues).toEqual([{ kind: "flight", spec }]);
  });

  it("gives no cue when phase is unchanged between calls", () => {
    const watcher = createPhaseWatcher();
    watcher.cues([firework("a", "flying")]);

    const cues = watcher.cues([firework("a", "flying")]);

    expect(cues).toEqual([]);
  });

  it("gives no cue for a transition that isn't launch, flight, or burst", () => {
    const watcher = createPhaseWatcher();
    watcher.cues([firework("a", "exploding")]);

    const cues = watcher.cues([firework("a", "finished")]);

    expect(cues).toEqual([]);
  });

  it("forgets an id absent from a call, treating its return as a first sighting again", () => {
    const watcher = createPhaseWatcher();
    watcher.cues([firework("a", "flying")]);
    watcher.cues([]); // "a" is gone

    const cues = watcher.cues([firework("a", "exploding")]);

    expect(cues).toEqual([]);
  });

  it("tracks multiple fireworks independently", () => {
    const watcher = createPhaseWatcher();
    const specA = fireworkSpec("a");
    const specB = fireworkSpec("b");
    watcher.cues([
      firework("a", "armed", specA),
      firework("b", "flying", specB),
    ]);

    const cues = watcher.cues([
      firework("a", "launching", specA),
      firework("b", "exploding", specB),
    ]);

    expect(cues).toEqual([
      { kind: "launch", spec: specA },
      { kind: "burst", spec: specB },
    ]);
  });
});

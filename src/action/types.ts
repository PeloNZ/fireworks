// The Action-layer contract, grown one cycle at a time — same discipline as
// src/control/types.ts. knip flags an exported type nothing imports yet as
// dead code, so a type lands here only in the cycle that first needs it.
// See docs/04_plan_action_layer.md.

/**
 * A point or direction in world space. `z` is carried on every vector and
 * always `0` in v1, leaving room for depth later without reshaping
 * anything that already uses `Vec3`. See "World space" in
 * docs/04_plan_action_layer.md.
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The burst shape a firework's particles form. See `pickPattern` in
 * traits.ts. */
export type FireworkPattern = "peony" | "willow" | "ring" | "chrysanthemum";

/** The character of a firework's sound effect. See `pickSound` in
 * traits.ts. */
export type FireworkTimbre = "soft" | "sharp" | "crackle";

/** A firework's sound: pitch in Hz plus a timbre. See `pickSound` in
 * traits.ts. */
export interface FireworkSound {
  readonly pitch: number;
  readonly timbre: FireworkTimbre;
}

/**
 * The two seeds every trait picker in this layer branches on, derived once
 * per press by `deriveSeeds`. `key` is stable for one physical key, however
 * many times it's pressed — it picks the "family" (launch angle, pattern,
 * colour family, pitch). `press` differs every press — it picks the
 * "variation" within that family. See "Seeded randomness" in
 * docs/04_plan_action_layer.md.
 */
export interface Seeds {
  readonly key: number;
  readonly press: number;
}

/**
 * The recipe: everything decided once at key press, built by
 * `buildFireworkSpec` in spec.ts. Never changes after that — it's what a
 * second machine would need to show the identical firework, once
 * multiplayer exists. `seed` is separate from `Seeds` above: it exists only
 * for AudioVisual's per-particle jitter, not for picking any of this
 * spec's own fields.
 */
export interface FireworkSpec {
  readonly id: string;
  readonly launchedAt: number;
  readonly origin: Vec3;
  readonly velocity: Vec3;
  readonly thrust: number;
  readonly fuelMs: number;
  readonly fuseMs: number;
  readonly pattern: FireworkPattern;
  readonly colors: readonly string[];
  readonly particleCount: number;
  readonly burstDurationMs: number;
  readonly sound: FireworkSound;
  readonly seed: number;
}

/**
 * A firework's stage, in order. Each exists so AudioVisual has a distinct
 * set of effects to draw later — these are not physics modes, and physics
 * runs the same integration through "launching", "flying" and "exploding"
 * regardless of which one is active. See "The state machine" in
 * docs/04_plan_action_layer.md.
 *
 * Not exported yet — `Firework` below is the only thing that names it so
 * far, in this same file. It gets its own export in cycle 12 (`stepPhase`),
 * the first cycle that needs to import it directly.
 */
type FireworkPhase =
  "armed" | "launching" | "flying" | "exploding" | "finished";

/**
 * The live object: built once from a `FireworkSpec` by `createFirework`,
 * then changed every step by `stepPhysics` and `stepPhase`. Never sent
 * anywhere — it stays inside the simulation, unlike `FireworkSpec`.
 */
export interface Firework {
  readonly spec: FireworkSpec;
  readonly phase: FireworkPhase;
  readonly position: Vec3;
  readonly previousPosition: Vec3;
  readonly velocity: Vec3;
  readonly fuelRemainingMs: number;
  readonly fuseRemainingMs: number;
  readonly phaseElapsedMs: number;
}

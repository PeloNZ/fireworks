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

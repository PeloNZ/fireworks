// The Action-layer contract, grown one cycle at a time — same discipline as
// src/control/types.ts. knip flags an exported type nothing imports yet as
// dead code, so a type lands here only in the cycle that first needs it.
// See docs/04_plan_action_layer.md.

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

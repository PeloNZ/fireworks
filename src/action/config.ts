// How a key press becomes a firework recipe. Grown one cycle at a time,
// same discipline as types.ts — see docs/04_plan_action_layer.md's Config
// section for the full shape this grows toward.

import type { FireworkPattern } from "./types.ts";

/** A closed numeric range, `min` to `max` inclusive. Not `Range` — the DOM
 * library already defines a global `Range`, and shadowing it would make
 * that name ambiguous wherever it shows up in an error message. */
export interface NumberRange {
  readonly min: number;
  readonly max: number;
}

export interface ActionConfig {
  readonly launchSpeed: NumberRange;
  readonly launchAngle: NumberRange; // degrees from vertical
  readonly thrust: NumberRange;
  readonly fuelMs: NumberRange;
  readonly fuseMs: NumberRange;
  readonly patterns: readonly FireworkPattern[];
}

export const defaultActionConfig: ActionConfig = Object.freeze({
  launchSpeed: Object.freeze({ min: 30, max: 55 }),
  launchAngle: Object.freeze({ min: -25, max: 25 }),
  thrust: Object.freeze({ min: 20, max: 40 }),
  fuelMs: Object.freeze({ min: 300, max: 700 }),
  fuseMs: Object.freeze({ min: 800, max: 1400 }),
  patterns: Object.freeze<readonly FireworkPattern[]>([
    "peony",
    "willow",
    "ring",
    "chrysanthemum",
  ]),
});

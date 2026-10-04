// How a key press becomes a firework recipe. Grown one cycle at a time,
// same discipline as types.ts — see docs/04_plan_action_layer.md's Config
// section for the full shape this grows toward. This file holds the types.
// The default values are in src/config.ts.

import type { FireworkPattern, FireworkTimbre, Vec3 } from "./types.ts";

/** A closed numeric range, `min` to `max` inclusive. Not `Range` — the DOM
 * library already defines a global `Range`, and shadowing it would make
 * that name ambiguous wherever it shows up in an error message. */
export interface NumberRange {
  readonly min: number;
  readonly max: number;
}

export interface ActionConfig {
  readonly launchOrigin: Vec3;
  readonly launchSpeed: NumberRange;
  readonly launchAngle: NumberRange; // degrees from vertical
  readonly thrust: NumberRange;
  readonly fuelMs: NumberRange;
  readonly fuseMs: NumberRange;
  readonly patterns: readonly FireworkPattern[];
  readonly palettes: readonly (readonly string[])[]; // colour families
  readonly paletteSize: number; // colours drawn per firework
  readonly particleCount: NumberRange;
  readonly burstDurationMs: NumberRange;
  readonly launchDurationMs: number; // armed -> launching -> flying
  readonly sound: {
    readonly pitch: NumberRange;
    readonly timbres: readonly FireworkTimbre[];
  };
}

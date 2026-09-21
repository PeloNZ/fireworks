// How a key press becomes a firework recipe. Grown one cycle at a time,
// same discipline as types.ts — see docs/04_plan_action_layer.md's Config
// section for the full shape this grows toward.

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
  readonly sound: {
    readonly pitch: NumberRange;
    readonly timbres: readonly FireworkTimbre[];
  };
}

export const defaultActionConfig: ActionConfig = Object.freeze({
  launchOrigin: Object.freeze({ x: 0, y: 0, z: 0 }),
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
  palettes: Object.freeze([
    Object.freeze([
      "#ff3b30",
      "#ff9500",
      "#ffcc00",
      "#ffe066",
      "#ff6b6b",
      "#ffb4a2",
      "#ff8552",
      "#ffd23f",
    ]),
    Object.freeze([
      "#34c759",
      "#30d5c8",
      "#00c2ff",
      "#5ac8fa",
      "#a1f2e0",
      "#7fffd4",
      "#48cae4",
      "#90e0ef",
    ]),
    Object.freeze([
      "#af52de",
      "#ff2d95",
      "#c77dff",
      "#e0aaff",
      "#ff8fe3",
      "#d291ff",
      "#f72585",
      "#b5179e",
    ]),
  ]),
  paletteSize: 3,
  particleCount: Object.freeze({ min: 40, max: 120 }),
  burstDurationMs: Object.freeze({ min: 600, max: 1200 }),
  sound: Object.freeze({
    pitch: Object.freeze({ min: 220, max: 880 }),
    timbres: Object.freeze<readonly FireworkTimbre[]>([
      "soft",
      "sharp",
      "crackle",
    ]),
  }),
});

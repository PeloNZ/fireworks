// World-wide physics parameters, separate from ActionConfig — see "Config"
// in docs/04_plan_action_layer.md for why: these apply to every firework
// equally and get retuned once to change how the whole game feels, unlike
// ActionConfig's per-firework values. This file holds the type. The default
// values are in src/config.ts.

import type { Vec3 } from "./types.ts";

export interface WorldConfig {
  readonly gravity: Vec3;
  readonly wind: Vec3;
  readonly drag: number; // 0 = none; fraction of velocity lost per second
  readonly stepMs: number; // fixed timestep
}

import type { ActionConfig } from "./config.ts";
import { buildFireworkSpec } from "./spec.ts";
import type { FireworkSpec } from "./types.ts";
import type { ControlEvent } from "../control/types.ts";

/**
 * Turns one `ControlEvent` into the fireworks it produces. A `"single"`
 * event always produces exactly one spec today, but the return type is a
 * list — the seam decision 4 in docs/04_plan_action_layer.md reserves. A
 * chord or a sequence-triggered special firework later appends to this
 * array; this function's signature never has to change for that.
 */
export function resolveAction(
  event: ControlEvent,
  config: ActionConfig,
): readonly FireworkSpec[] {
  return [buildFireworkSpec(event.signal, config)];
}

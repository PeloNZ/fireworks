import type { ActionConfig } from "./config.ts";
import { buildFireworkSpec } from "./spec.ts";
import type { createWorld } from "./world.ts";
import type { FireworkSpec } from "./types.ts";
import type { ControlEvent, ControlEventSink } from "../control/types.ts";

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

/**
 * Wires `resolveAction` to a world: returns a plain function matching
 * `ControlEventSink`'s shape, the same idea as `createConsoleSink` in the
 * Control layer. Each resolved spec is spawned into `world`, in order.
 */
export function createActionLayer(options: {
  readonly world: ReturnType<typeof createWorld>;
  readonly config: ActionConfig;
}): ControlEventSink {
  const { world, config } = options;
  return (event) => {
    for (const spec of resolveAction(event, config)) {
      world.spawn(spec);
    }
  };
}

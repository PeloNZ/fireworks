import type { ControlConfig } from "./config.ts";
import type { ControlSignal, ControlSource, RawInput } from "./types.ts";

/**
 * Turns a device-neutral RawInput into a ControlSignal. Pure: the same
 * arguments always produce the same result — no clock read, no I/O. This
 * is what makes a recorded key log replayable later (see "Extensibility
 * notes" in docs/02_spec.md).
 *
 * `id`/`shift`/`timestamp` pass through from `raw` unchanged. `intensity`
 * and `source` are policy the adapter is never allowed to decide for
 * itself — see "Why the adapter emits RawInput, not ControlSignal" in
 * docs/03_plan_control_layer.md.
 */
export function buildSignal(
  raw: RawInput,
  source: ControlSource,
  config: ControlConfig,
): ControlSignal {
  return {
    id: raw.code,
    shift: raw.shift,
    timestamp: raw.timestamp,
    intensity: config.defaultIntensity,
    source,
  };
}

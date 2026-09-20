// The cross-layer contract. Everything downstream of Control (the Action
// layer, eventually) depends only on the shapes in this file — never on
// how a signal was produced. See docs/02_spec.md and docs/03_plan_control_layer.md.
//
// Grown one cycle at a time, not written all upfront: knip (see
// docs/03_plan_control_layer.md#linting-and-static-analysis) flags an
// exported type nothing imports yet as dead code, and it's right to —
// ControlEvent, ControllerAdapter, and ControlEventSink belong here too,
// but arrive with the cycles that actually consume them (5 and 6).

/** Which adapter produced a signal. A union of one today; widened when a
 * second adapter (MIDI, motion) is built. Downstream logic should avoid
 * branching on this — see "Extensibility notes" in docs/02_spec.md. */
export type ControlSource = 'keyboard'

/**
 * A device-neutral description of "something meaningful happened", as
 * produced by an adapter. No policy lives here — no intensity, no source
 * label. That's the Control layer core's job (see `buildSignal` in
 * signal.ts, and "Why the adapter emits RawInput" in
 * docs/03_plan_control_layer.md).
 */
export interface RawInput {
  readonly code: string
  readonly shift: boolean
  readonly timestamp: number
}

/** What Control hands downstream: a RawInput plus the policy fields only
 * the core is allowed to decide. */
export interface ControlSignal {
  readonly id: string
  readonly shift: boolean
  readonly timestamp: number
  readonly intensity: number
  readonly source: ControlSource
}

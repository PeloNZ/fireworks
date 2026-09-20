// The cross-layer contract. Everything downstream of Control (the Action
// layer, eventually) depends only on the shapes in this file — never on
// how a signal was produced. See docs/02_spec.md and docs/03_plan_control_layer.md.
//
// Grown one cycle at a time, not written all upfront: knip (see
// docs/03_plan_control_layer.md#linting-and-static-analysis) flags an
// exported type nothing imports yet as dead code, and every type below
// was added in the cycle that first needed to name it.

/** Which adapter produced a signal. A union of one today; widened when a
 * second adapter (MIDI, motion) is built. Downstream logic should avoid
 * branching on this — see "Extensibility notes" in docs/02_spec.md. */
export type ControlSource = "keyboard";

/**
 * A device-neutral description of "something meaningful happened", as
 * produced by an adapter. No policy lives here — no intensity, no source
 * label. That's the Control layer core's job (see `buildSignal` in
 * signal.ts, and "Why the adapter emits RawInput" in
 * docs/03_plan_control_layer.md).
 */
export interface RawInput {
  readonly code: string;
  readonly shift: boolean;
  readonly timestamp: number;
}

/** What Control hands downstream: a RawInput plus the policy fields only
 * the core is allowed to decide. */
export interface ControlSignal {
  readonly id: string;
  readonly shift: boolean;
  readonly timestamp: number;
  readonly intensity: number;
  readonly source: ControlSource;
}

/**
 * Control → Action event shape. A discriminated union — an object with a
 * literal `kind` field that lets code branch and narrow the type safely —
 * with one member for v1. This is the "chord seam": adding a `"chord"`
 * member later only means adding a case, not reshaping `"single"`.
 */
// A discriminated union needs `type`; a future `| { kind: 'chord'; signals:
// ControlSignal[] }` member has to be additive, and `interface` can't
// express a union at all, let alone grow one without reshaping this member.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ControlEvent = { kind: "single"; signal: ControlSignal };

/**
 * The seam every adapter must fill. Deliberately tiny — two methods, no
 * inheritance — so a fake implementation for tests costs nothing to write.
 * `start` takes the emit callback rather than receiving it at construction
 * time, so a caller can build the adapter first and decide later what to
 * do with each input.
 */
export interface ControllerAdapter {
  readonly source: ControlSource;
  start(emit: (input: RawInput) => void): void;
  stop(): void;
}

/**
 * A sink is just a function. No interface, no class to implement — any
 * function with this shape satisfies it, `console.debug` included once
 * wrapped in one line by `createConsoleSink`. Introducing a class here
 * would add ceremony to solve a problem — "plug in different output
 * destinations" — a plain function already solves.
 */
export type ControlEventSink = (event: ControlEvent) => void;

// Config is a single read-only object, not scattered constants — see
// docs/02_spec.md#config. Nothing here is hardcoded into logic; every
// consumer reads its values from a ControlConfig instance.

export interface ControlConfig {
  readonly defaultIntensity: number
  readonly historyMaxEntries: number
  readonly historyMaxAgeMs: number
  /** Only the keyboard adapter reads this — see "Where noise filtering
   * belongs" in docs/02_spec.md. Nested here (not exported on its own
   * yet — nothing outside this file needs to name the shape until the
   * keyboard adapter is built in a later cycle) so the ownership is
   * visible just from reading this type. */
  readonly keyboard: {
    readonly deniedCodes: readonly string[]
  }
}

export const defaultConfig: ControlConfig = Object.freeze({
  defaultIntensity: 1.0,
  historyMaxEntries: 16,
  historyMaxAgeMs: 2000,
  keyboard: Object.freeze({
    deniedCodes: Object.freeze([
      'ShiftLeft',
      'ShiftRight',
      'ControlLeft',
      'ControlRight',
      'AltLeft',
      'AltRight',
      'MetaLeft',
      'MetaRight',
      'CapsLock',
    ]),
  }),
})

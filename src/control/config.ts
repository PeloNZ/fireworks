// Config is a single read-only object, not scattered constants — see
// docs/02_spec.md#config. Nothing here is hardcoded into logic; every
// consumer reads its values from a ControlConfig instance.

/** Only the keyboard adapter reads this — see "Where noise filtering
 * belongs" in docs/02_spec.md. Named and exported now that cycle 2's
 * `interpretKeyEvent` (src/control/adapters/keyboard.ts) needs to name the
 * shape itself; until that cycle, this lived inline in `ControlConfig` with
 * nothing to import it. */
export interface KeyboardConfig {
  readonly deniedCodes: readonly string[];
}

export interface ControlConfig {
  readonly defaultIntensity: number;
  readonly historyMaxEntries: number;
  readonly historyMaxAgeMs: number;
  readonly keyboard: KeyboardConfig;
}

export const defaultConfig: ControlConfig = Object.freeze({
  defaultIntensity: 1.0,
  historyMaxEntries: 16,
  historyMaxAgeMs: 2000,
  keyboard: Object.freeze({
    deniedCodes: Object.freeze([
      "ShiftLeft",
      "ShiftRight",
      "ControlLeft",
      "ControlRight",
      "AltLeft",
      "AltRight",
      "MetaLeft",
      "MetaRight",
      "CapsLock",
    ]),
  }),
});

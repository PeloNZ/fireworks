import type { KeyboardConfig } from '../config.ts'
import type { RawInput } from '../types.ts'

/**
 * The minimal slice of a real `KeyboardEvent` this function needs — a
 * "port": a boundary type defined by the code that uses it, which anything
 * matching the shape can satisfy. Tests construct this by hand as a plain
 * object; no browser or `jsdom` required. See "Why a fake target beats
 * jsdom" in docs/03_plan_control_layer.md.
 */
export interface KeyEventLike {
  readonly code: string
  readonly shiftKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly repeat: boolean
  readonly timeStamp: number
}

/**
 * What `interpretKeyEvent` decided, without acting on it. Returning a
 * decision — rather than calling `event.preventDefault()` directly — is
 * what keeps this function pure: given the same event twice, it always
 * returns the same decision, with no reach into the DOM.
 */
export interface KeyDecision {
  readonly input: RawInput | null
  readonly preventDefault: boolean
}

// Suppressing these prevents the page from scrolling or moving focus.
// Codes only — see the Ctrl/Meta guard below for why that's not the whole
// story.
const NAVIGATION_CODES = new Set([
  'Tab',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

/**
 * Turns one `keydown` event into a decision: is there a meaningful press
 * here, and should the browser's default action be suppressed. This is the
 * only place in the codebase allowed to know what `event.repeat` means or
 * that `"ShiftLeft"` is a modifier — see "Where noise filtering belongs" in
 * docs/02_spec.md.
 */
export function interpretKeyEvent(
  event: KeyEventLike,
  keyboardConfig: KeyboardConfig,
): KeyDecision {
  if (event.ctrlKey || event.metaKey) {
    // Ctrl/Meta held is browser/OS territory (Cmd+R, Ctrl+W, Ctrl+Tab):
    // never treat it as game input, and never suppress its default
    // behavior either — "survives" has to mean both, or Ctrl+Tab would
    // still get hijacked even though Cmd+R doesn't.
    return { input: null, preventDefault: false }
  }

  const preventDefault = NAVIGATION_CODES.has(event.code)

  if (event.repeat || keyboardConfig.deniedCodes.includes(event.code)) {
    return { input: null, preventDefault }
  }

  return {
    input: { code: event.code, shift: event.shiftKey, timestamp: event.timeStamp },
    preventDefault,
  }
}

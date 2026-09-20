import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config.ts'
import { interpretKeyEvent } from './keyboard.ts'
import type { KeyEventLike } from './keyboard.ts'

// Cycle 2 (docs/03_plan_control_layer.md): interpretKeyEvent owns every
// keyboard-specific noise-filtering rule from docs/02_spec.md. It's pure —
// no DOM types, no side effects — so tests construct plain fixture objects
// shaped like a KeyboardEvent rather than pulling in jsdom. See "Why a fake
// target beats jsdom" in 03_plan_control_layer.md.

const baseEvent: KeyEventLike = {
  code: 'KeyA',
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  timeStamp: 1000,
}

const keyboardConfig = defaultConfig.keyboard

describe('interpretKeyEvent', () => {
  it('produces an input for an ordinary letter key, passing code and timestamp through', () => {
    const decision = interpretKeyEvent(baseEvent, keyboardConfig)

    expect(decision.input).toEqual({ code: 'KeyA', shift: false, timestamp: 1000 })
  })

  it("captures shiftKey into the input's shift field", () => {
    const decision = interpretKeyEvent({ ...baseEvent, shiftKey: true }, keyboardConfig)

    expect(decision.input?.shift).toBe(true)
  })

  it('drops a held-key repeat', () => {
    const decision = interpretKeyEvent({ ...baseEvent, repeat: true }, keyboardConfig)

    expect(decision.input).toBeNull()
  })

  it('drops a standalone press of a denied (modifier) code', () => {
    const decision = interpretKeyEvent({ ...baseEvent, code: 'ShiftLeft' }, keyboardConfig)

    expect(decision.input).toBeNull()
  })

  it('drops any press held with Ctrl, so a browser shortcut like Ctrl+W is never hijacked', () => {
    const decision = interpretKeyEvent({ ...baseEvent, code: 'KeyW', ctrlKey: true }, keyboardConfig)

    expect(decision.input).toBeNull()
  })

  it('drops any press held with Meta, so Cmd+R survives', () => {
    const decision = interpretKeyEvent({ ...baseEvent, code: 'KeyR', metaKey: true }, keyboardConfig)

    expect(decision.input).toBeNull()
  })

  it('decides to preventDefault for Tab, Space, and arrow codes', () => {
    for (const code of ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const decision = interpretKeyEvent({ ...baseEvent, code }, keyboardConfig)
      expect(decision.preventDefault).toBe(true)
    }
  })

  it('does not decide to preventDefault for an ordinary letter or a denied code', () => {
    expect(interpretKeyEvent(baseEvent, keyboardConfig).preventDefault).toBe(false)
    expect(
      interpretKeyEvent({ ...baseEvent, code: 'ShiftLeft' }, keyboardConfig).preventDefault,
    ).toBe(false)
  })

  it('never decides to preventDefault when Ctrl or Meta is held, even for Tab', () => {
    // Otherwise a real browser/OS shortcut that happens to use one of our
    // navigation-suppression keys — Ctrl+Tab switches browser tabs — would
    // get hijacked exactly like the Cmd+R case above.
    const decision = interpretKeyEvent({ ...baseEvent, code: 'Tab', ctrlKey: true }, keyboardConfig)

    expect(decision).toEqual({ input: null, preventDefault: false })
  })
})

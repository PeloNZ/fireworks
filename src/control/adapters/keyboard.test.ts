import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../config.ts";
import { createKeyboardAdapter, interpretKeyEvent } from "./keyboard.ts";
import type { KeyboardListenerEvent, KeyEventLike } from "./keyboard.ts";

// Cycle 2 (docs/03_plan_control_layer.md): interpretKeyEvent owns every
// keyboard-specific noise-filtering rule from docs/02_spec.md. It's pure —
// no DOM types, no side effects — so tests construct plain fixture objects
// shaped like a KeyboardEvent rather than pulling in jsdom. See "Why a fake
// target beats jsdom" in 03_plan_control_layer.md.

const baseEvent: KeyEventLike = {
  code: "KeyA",
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  timeStamp: 1000,
};

const keyboardConfig = defaultConfig.keyboard;

describe("interpretKeyEvent", () => {
  it("produces an input for an ordinary letter key, passing code and timestamp through", () => {
    const decision = interpretKeyEvent(baseEvent, keyboardConfig);

    expect(decision.input).toEqual({
      code: "KeyA",
      shift: false,
      timestamp: 1000,
    });
  });

  it("captures shiftKey into the input's shift field", () => {
    const decision = interpretKeyEvent(
      { ...baseEvent, shiftKey: true },
      keyboardConfig,
    );

    expect(decision.input?.shift).toBe(true);
  });

  it("drops a held-key repeat", () => {
    const decision = interpretKeyEvent(
      { ...baseEvent, repeat: true },
      keyboardConfig,
    );

    expect(decision.input).toBeNull();
  });

  it("drops a standalone press of a denied (modifier) code", () => {
    const decision = interpretKeyEvent(
      { ...baseEvent, code: "ShiftLeft" },
      keyboardConfig,
    );

    expect(decision.input).toBeNull();
  });

  it("drops any press held with Ctrl, so a browser shortcut like Ctrl+W is never hijacked", () => {
    const decision = interpretKeyEvent(
      { ...baseEvent, code: "KeyW", ctrlKey: true },
      keyboardConfig,
    );

    expect(decision.input).toBeNull();
  });

  it("drops any press held with Meta, so Cmd+R survives", () => {
    const decision = interpretKeyEvent(
      { ...baseEvent, code: "KeyR", metaKey: true },
      keyboardConfig,
    );

    expect(decision.input).toBeNull();
  });

  it("decides to preventDefault for Tab, Space, and arrow codes", () => {
    for (const code of [
      "Tab",
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ]) {
      const decision = interpretKeyEvent(
        { ...baseEvent, code },
        keyboardConfig,
      );
      expect(decision.preventDefault).toBe(true);
    }
  });

  it("does not decide to preventDefault for an ordinary letter or a denied code", () => {
    expect(interpretKeyEvent(baseEvent, keyboardConfig).preventDefault).toBe(
      false,
    );
    expect(
      interpretKeyEvent({ ...baseEvent, code: "ShiftLeft" }, keyboardConfig)
        .preventDefault,
    ).toBe(false);
  });

  it("never decides to preventDefault when Ctrl or Meta is held, even for Tab", () => {
    // Otherwise a real browser/OS shortcut that happens to use one of our
    // navigation-suppression keys — Ctrl+Tab switches browser tabs — would
    // get hijacked exactly like the Cmd+R case above.
    const decision = interpretKeyEvent(
      { ...baseEvent, code: "Tab", ctrlKey: true },
      keyboardConfig,
    );

    expect(decision).toEqual({ input: null, preventDefault: false });
  });
});

// Cycle 5 (docs/03_plan_control_layer.md): createKeyboardAdapter is the
// only non-pure piece here — it wires interpretKeyEvent to a real
// EventTarget. Tests use a fake target (a "port" — see "Why a fake target
// beats jsdom" in 03_plan_control_layer.md), not jsdom, so this still runs
// in plain Node.

function fakeTarget() {
  return {
    addEventListener:
      vi.fn<
        (
          type: "keydown",
          listener: (event: KeyboardListenerEvent) => void,
        ) => void
      >(),
    removeEventListener:
      vi.fn<
        (
          type: "keydown",
          listener: (event: KeyboardListenerEvent) => void,
        ) => void
      >(),
  };
}

function listenerEvent(
  overrides: Partial<KeyboardListenerEvent> = {},
): KeyboardListenerEvent {
  return { ...baseEvent, preventDefault: vi.fn(), ...overrides };
}

/** Starts the adapter against `target` and returns the handler function
 * `target.addEventListener` actually received, so a test can fire it
 * directly instead of needing a real, dispatching EventTarget. */
function startAndCaptureHandler(
  target: ReturnType<typeof fakeTarget>,
  emit: (input: {
    code: string;
    shift: boolean;
    timestamp: number;
  }) => void = vi.fn(),
): (event: KeyboardListenerEvent) => void {
  const adapter = createKeyboardAdapter({ target, config: keyboardConfig });
  adapter.start(emit);

  const call = target.addEventListener.mock.calls[0];
  if (!call) {
    throw new Error("expected addEventListener to have been called");
  }
  return call[1];
}

describe("createKeyboardAdapter", () => {
  it("reports its source as keyboard", () => {
    const adapter = createKeyboardAdapter({
      target: fakeTarget(),
      config: keyboardConfig,
    });

    expect(adapter.source).toBe("keyboard");
  });

  it("registers exactly one keydown listener on start", () => {
    const target = fakeTarget();
    const adapter = createKeyboardAdapter({ target, config: keyboardConfig });

    adapter.start(vi.fn());

    expect(target.addEventListener).toHaveBeenCalledTimes(1);
    expect(target.addEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });

  it("emits a RawInput when the fired event is one interpretKeyEvent accepts", () => {
    const target = fakeTarget();
    const emit = vi.fn();
    const handler = startAndCaptureHandler(target, emit);

    handler(listenerEvent({ code: "KeyA" }));

    expect(emit).toHaveBeenCalledWith({
      code: "KeyA",
      shift: false,
      timestamp: 1000,
    });
  });

  it("does not emit when the fired event is one interpretKeyEvent rejects", () => {
    const target = fakeTarget();
    const emit = vi.fn();
    const handler = startAndCaptureHandler(target, emit);

    handler(listenerEvent({ repeat: true }));

    expect(emit).not.toHaveBeenCalled();
  });

  it("calls preventDefault on the real event when interpretKeyEvent says to", () => {
    const target = fakeTarget();
    const handler = startAndCaptureHandler(target);
    const event = listenerEvent({ code: "Tab" });

    handler(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not call preventDefault when interpretKeyEvent says not to", () => {
    const target = fakeTarget();
    const handler = startAndCaptureHandler(target);
    const event = listenerEvent({ code: "KeyA" });

    handler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("removes on stop the exact same function addEventListener received", () => {
    const target = fakeTarget();
    const adapter = createKeyboardAdapter({ target, config: keyboardConfig });
    adapter.start(vi.fn());
    const call = target.addEventListener.mock.calls[0];
    if (!call) {
      throw new Error("expected addEventListener to have been called");
    }
    const registeredHandler = call[1];

    adapter.stop();

    expect(target.removeEventListener).toHaveBeenCalledWith(
      "keydown",
      registeredHandler,
    );
  });

  it("does nothing on stop if start was never called", () => {
    const target = fakeTarget();
    const adapter = createKeyboardAdapter({ target, config: keyboardConfig });

    adapter.stop();

    expect(target.removeEventListener).not.toHaveBeenCalled();
  });
});

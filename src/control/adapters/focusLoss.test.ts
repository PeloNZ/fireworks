import { describe, expect, it, vi } from "vitest";
import { createWindowFocusLoss } from "./focusLoss.ts";

// Cycle 8 (docs/03_plan_control_layer.md): the real implementation of
// FocusLossSource. Fake targets, same idea as "Why a fake target beats
// jsdom" for the keyboard adapter — a plain object with the two methods
// this file actually calls, no jsdom.

function fakeEventTarget() {
  return {
    addEventListener: vi.fn<(type: string, listener: () => void) => void>(),
    removeEventListener: vi.fn<(type: string, listener: () => void) => void>(),
  };
}

function fakeDocumentTarget(hidden: boolean) {
  return { ...fakeEventTarget(), hidden };
}

/** Fires the listener registered for `type`, so a test can trigger a
 * browser event without a real, dispatching EventTarget. */
function fire(target: ReturnType<typeof fakeEventTarget>, type: string) {
  const call = target.addEventListener.mock.calls.find(
    ([registeredType]) => registeredType === type,
  );
  if (!call) {
    throw new Error(`expected a listener registered for "${type}"`);
  }
  call[1]();
}

describe("createWindowFocusLoss", () => {
  it("registers a blur listener on the window target and a visibilitychange listener on the document target", () => {
    const windowTarget = fakeEventTarget();
    const documentTarget = fakeDocumentTarget(false);
    const source = createWindowFocusLoss({ windowTarget, documentTarget });

    source.start(vi.fn());

    expect(windowTarget.addEventListener).toHaveBeenCalledWith(
      "blur",
      expect.any(Function),
    );
    expect(documentTarget.addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });

  it("calls back when the window fires blur", () => {
    const windowTarget = fakeEventTarget();
    const documentTarget = fakeDocumentTarget(false);
    const source = createWindowFocusLoss({ windowTarget, documentTarget });
    const onFocusLoss = vi.fn();
    source.start(onFocusLoss);

    fire(windowTarget, "blur");

    expect(onFocusLoss).toHaveBeenCalledTimes(1);
  });

  it("calls back when visibilitychange fires while the document is hidden", () => {
    const windowTarget = fakeEventTarget();
    const documentTarget = fakeDocumentTarget(true);
    const source = createWindowFocusLoss({ windowTarget, documentTarget });
    const onFocusLoss = vi.fn();
    source.start(onFocusLoss);

    fire(documentTarget, "visibilitychange");

    expect(onFocusLoss).toHaveBeenCalledTimes(1);
  });

  it("does not call back on visibilitychange while the document is visible", () => {
    const windowTarget = fakeEventTarget();
    const documentTarget = fakeDocumentTarget(false);
    const source = createWindowFocusLoss({ windowTarget, documentTarget });
    const onFocusLoss = vi.fn();
    source.start(onFocusLoss);

    fire(documentTarget, "visibilitychange");

    expect(onFocusLoss).not.toHaveBeenCalled();
  });

  it("removes both listeners on stop", () => {
    const windowTarget = fakeEventTarget();
    const documentTarget = fakeDocumentTarget(false);
    const source = createWindowFocusLoss({ windowTarget, documentTarget });
    source.start(vi.fn());
    const blurHandler = windowTarget.addEventListener.mock.calls.find(
      ([type]) => type === "blur",
    )?.[1];
    const visibilityHandler = documentTarget.addEventListener.mock.calls.find(
      ([type]) => type === "visibilitychange",
    )?.[1];

    source.stop();

    expect(windowTarget.removeEventListener).toHaveBeenCalledWith(
      "blur",
      blurHandler,
    );
    expect(documentTarget.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      visibilityHandler,
    );
  });

  it("removes the first pair of listeners when start is called again, so a second start does not leak them", () => {
    const windowTarget = fakeEventTarget();
    const documentTarget = fakeDocumentTarget(false);
    const source = createWindowFocusLoss({ windowTarget, documentTarget });
    source.start(vi.fn());
    const firstBlurHandler = windowTarget.addEventListener.mock.calls.find(
      ([type]) => type === "blur",
    )?.[1];
    const firstVisibilityHandler =
      documentTarget.addEventListener.mock.calls.find(
        ([type]) => type === "visibilitychange",
      )?.[1];

    source.start(vi.fn());

    expect(windowTarget.removeEventListener).toHaveBeenCalledWith(
      "blur",
      firstBlurHandler,
    );
    expect(documentTarget.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      firstVisibilityHandler,
    );
    expect(windowTarget.addEventListener).toHaveBeenCalledTimes(2);
    expect(documentTarget.addEventListener).toHaveBeenCalledTimes(2);
  });
});

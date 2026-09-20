import type { FocusLossSource } from "../types.ts";

/**
 * The minimal slice of `Window` this file needs — a port, exactly like
 * `KeyboardEventTarget` in keyboard.ts. Real usage passes `window`; tests
 * pass a plain object with two methods.
 */
export interface WindowFocusTarget {
  addEventListener(type: "blur", listener: () => void): void;
  removeEventListener(type: "blur", listener: () => void): void;
}

/**
 * The minimal slice of `Document` this file needs. `hidden` is read fresh
 * on every `visibilitychange`, not cached, so it always reflects the
 * document's current state.
 */
export interface DocumentVisibilityTarget {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/**
 * The real `FocusLossSource`: fires on window `blur`, and on the page
 * becoming hidden (`visibilitychange` while `document.hidden`). Both halves
 * of the rule in "Buffer reset rule: focus/blur loss" (docs/02_spec.md) live
 * here, in one file, so `FocusLossSource` itself stays two methods.
 */
export function createWindowFocusLoss(options: {
  readonly windowTarget: WindowFocusTarget;
  readonly documentTarget: DocumentVisibilityTarget;
}): FocusLossSource {
  const { windowTarget, documentTarget } = options;
  let blurHandler: (() => void) | null = null;
  let visibilityHandler: (() => void) | null = null;

  return {
    start(onFocusLoss) {
      if (blurHandler) {
        windowTarget.removeEventListener("blur", blurHandler);
      }
      if (visibilityHandler) {
        documentTarget.removeEventListener(
          "visibilitychange",
          visibilityHandler,
        );
      }
      blurHandler = () => {
        onFocusLoss();
      };
      visibilityHandler = () => {
        if (documentTarget.hidden) {
          onFocusLoss();
        }
      };
      windowTarget.addEventListener("blur", blurHandler);
      documentTarget.addEventListener("visibilitychange", visibilityHandler);
    },
    stop() {
      if (blurHandler) {
        windowTarget.removeEventListener("blur", blurHandler);
        blurHandler = null;
      }
      if (visibilityHandler) {
        documentTarget.removeEventListener(
          "visibilitychange",
          visibilityHandler,
        );
        visibilityHandler = null;
      }
    },
  };
}

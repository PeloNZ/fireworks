// The settings menu: which renderer and sound set run. Settings are app
// state, not game state, so nothing here touches the Control or Action
// layers beyond switching firework input on and off. See
// docs/10_settings_ui.md.

/** The slice of `HTMLDialogElement` the menu uses. */
export interface DialogLike {
  readonly open: boolean;
  showModal(): void;
  addEventListener(type: "close", listener: () => void): void;
}

/** The slice of `KeyboardEvent` the menu uses. */
export interface MenuKeyEvent {
  readonly code: string;
  preventDefault(): void;
}

/** The slice of `EventTarget` the menu uses. Real usage passes `window`. */
export interface MenuKeyTarget {
  addEventListener(
    type: "keydown",
    listener: (event: MenuKeyEvent) => void,
  ): void;
}

/** Firework input on and off. The real control layer fits this shape. */
export interface InputSwitch {
  start(): void;
  stop(): void;
}

/** Opens the dialog on Escape and stops firework input while it is open.
 * Any close of the dialog starts firework input again. */
export function attachSettingsMenu(options: {
  readonly dialog: DialogLike;
  readonly keyTarget: MenuKeyTarget;
  readonly control: InputSwitch;
}): void {
  const { dialog, keyTarget, control } = options;
  dialog.addEventListener("close", () => {
    control.start();
  });
  keyTarget.addEventListener("keydown", (event) => {
    // On an open dialog the browser closes it, so this stays out of the way.
    if (event.code !== "Escape" || dialog.open) {
      return;
    }
    // Cancelled so the browser's own Escape handling cannot close the
    // dialog this call just opened.
    event.preventDefault();
    control.stop();
    dialog.showModal();
  });
}

/** One radio per name. Only `selected` is checked. Order is kept. */
export function choicesFor(
  names: readonly string[],
  selected: string,
): readonly { readonly value: string; readonly checked: boolean }[] {
  return names.map((value) => ({ value, checked: value === selected }));
}

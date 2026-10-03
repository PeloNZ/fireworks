// The settings menu: which renderer and sound set run. Settings are app
// state, not game state, so nothing here touches the Control or Action
// layers beyond switching firework input on and off. See
// docs/10_settings_ui.md.

/** One radio per name. Only `selected` is checked. Order is kept. */
export function choicesFor(
  names: readonly string[],
  selected: string,
): readonly { readonly value: string; readonly checked: boolean }[] {
  return names.map((value) => ({ value, checked: value === selected }));
}

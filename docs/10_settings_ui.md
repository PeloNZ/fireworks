# Fireworks game — settings UI build plan (v1)

See `02_spec.md` for the layer contracts, `03_plan_control_layer.md` for the
Control layer, `07_emoji_renderer.md` for `selectRenderer`, and
`08_sound_effects.md` for the sound sets. Those documents stay closed as their
own v1 records. In this one, the cycle count resets to 1.

**Replaced in part by `13_settings_overrides.md`.** The menu now holds a POST
form, and the URL no longer carries a setting. Doc 13 replaces decision 2 (the
URL is the only source of truth), decision 5 (renderer and sound only), decision
8 (a GET form builds the URL), and the out-of-scope items "Settings in
`localStorage`" and "Settings other than renderer and sound". The rest of this
doc still holds: the native `<dialog>`, Esc, the stopped control layer and
`attachSettingsMenu`. The text below is the v1 record.

## Context

The user can pick a renderer and a sound set. Today the only way to do this is
to edit the URL (`?renderer=`, `?sound=`). `main.ts` reads each value once at
load through `selectRenderer`.

This plan adds a settings menu. The user presses Esc, picks a renderer and a
sound set, and presses Apply. The page reloads with the new URL.

## Decisions

The user made these decisions before anyone wrote this plan.

1. **Settings are app state, not game state.** The Control and Action layers
   never see a setting. `main.ts` owns the settings.
2. **A change takes effect by page reload.** The URL is the only source of
   truth. No setting goes into `localStorage`.
3. **Esc opens the menu.** Esc does not launch a firework.
4. **The menu is a native `<dialog>`** on top of the show. No renderer draws
   the menu.
5. **v1 covers renderer and sound.**
6. **Firework input stops while the menu is open.** The simulation continues.
   Fireworks in the air finish behind the dialog.
7. **A tested module holds the menu behaviour.** It uses fake DOM ports, the
   same way as the keyboard adapter.
8. **A native `<form method="get">` builds the URL.** The browser writes
   `?renderer=…&sound=…` and reloads. No code in this project builds a query
   string.
9. **An Apply button submits the form.** A radio change alone does nothing.

### Accepted costs of reload

- The fireworks in the air are lost.
- `main.ts` rerolls the sky. It already does this on every load.
- After an Apply by mouse click, sound stays off until the next key press. The
  audio unlock in `main.ts` listens for `keydown` only.

## Why settings do not go through Control and Action

The first idea was this path: UI → Control → Action → renderer. This plan
rejects that path for three reasons.

- **The Action layer is the simulation.** It holds positions, phases and
  physics. The renderer choice changes none of these. If Action held the
  renderer choice, it would hold state that it never reads.
- **The Control contract has one meaning.** `ControlEvent` is
  `{ kind: "single"; signal }` (`src/control/types.ts`). It means "a key was
  pressed, launch a firework". A "switch renderer" command is a different
  thing. It would need a new event kind that Action must ignore.
- **`main.ts` builds the renderer.** The code that builds a thing is the
  correct code to change it.

Most game engines use the same split. Input goes to an "input context" first:
gameplay or menu. Settings are app state. The simulation does not know which
renderer draws it.

```
key ──► Esc? ──yes──► settings menu ──► <form method="get"> ──► reload
          │
          no
          ▼
       Control ──► Action ──► (world state) ──► AudioVisual
```

## Why the keyboard needs an input context

The keyboard adapter has two rules that block a menu.

1. **Every key launches a firework.** The filter is a deny-list of modifier
   keys (`src/control/config.ts`). Esc, the F-keys and every letter pass
   through. So Esc must go on the deny-list before it can mean "settings".
2. **The adapter blocks Tab and Space on the whole page.** The adapter listens on
   `window`. It calls `preventDefault` on Tab, Space and the arrow keys
   (`src/control/adapters/keyboard.ts`). This stops the page from scrolling
   during a show. It also stops Tab from moving focus to a button.

Rule 2 already has a solution. `controlLayer.stop()` removes the adapter's
listener. `controlLayer.start()` adds it again. The menu calls `stop()` when it
opens and `start()` when it closes. While the menu is open, Tab, Space and
Enter work normally, and no key launches a firework.

## Why a native dialog and a GET form

The browser does most of the work.

| Need                        | Native feature                                              |
| --------------------------- | ----------------------------------------------------------- |
| Close on Esc                | `<dialog>` opened with `showModal()`                        |
| Keep Tab focus in the menu  | `showModal()`                                               |
| Draw above the pixel canvas | `showModal()` puts the dialog in the top layer              |
| Screen reader support       | `<dialog>`, `<fieldset>`, `<legend>`, radio `<input>`s      |
| Build the URL and reload    | `<form method="get">` with radios named `renderer`, `sound` |
| Close without a change      | `<button formmethod="dialog">`                              |

The top layer is above every `z-index`. The pixel canvases use
`position: fixed` with `z-index` 0 and 1 (`index.html`). They cannot cover the
dialog.

Only `renderer` and `sound` come from the URL today. So a GET form that sends
only those two fields drops no other parameter.

## Why the opening Esc calls preventDefault

A modal dialog closes when the user presses Esc. The browser does this as the
default action of the Esc `keydown`. The menu opens the dialog in a listener
for that same `keydown`. If the listener does not cancel the event, the
default action can then close the dialog that the listener just opened.

So the rules are:

- **Esc when the dialog is closed:** open the dialog, stop firework input, and
  call `preventDefault`.
- **Esc when the dialog is open:** do nothing. Do not call `preventDefault`.
  The browser then closes the dialog.

Nobody has checked this browser order yet. The manual checks below include it.

## Key contracts

All in `src/settings/settingsMenu.ts`. Each port is the smallest slice of the
real DOM type that the code uses. Tests pass plain objects.

```ts
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

export function attachSettingsMenu(options: {
  readonly dialog: DialogLike;
  readonly keyTarget: MenuKeyTarget;
  readonly control: InputSwitch;
}): void;

/** One radio per name. Only `selected` is checked. Order is kept. */
export function choicesFor(
  names: readonly string[],
  selected: string,
): readonly { readonly value: string; readonly checked: boolean }[];
```

`attachSettingsMenu` has no teardown method. Nothing calls one. Add it in the
cycle that first needs it.

`main.ts` passes the **resolved** name from `selectRenderer` to `choicesFor`,
not the raw URL value. With `?renderer=foo`, the page runs `ascii`, so the
menu must show `ascii` checked.

## File layout

| Path                                                        | Role                                            |
| ----------------------------------------------------------- | ----------------------------------------------- |
| `docs/10_settings_ui.md`                                    | This plan, written before cycle 1               |
| `src/settings/settingsMenu.ts`                              | Cycles 1–5 — `choicesFor`, `attachSettingsMenu` |
| `src/settings/settingsMenu.test.ts`                         | Cycles 1–5                                      |
| `src/control/config.ts`                                     | Cycle 6 — `"Escape"` added to `deniedCodes`     |
| `src/control/adapters/keyboard.test.ts`                     | Cycle 6 — Escape is dropped, not cancelled      |
| `src/main.ts`                                               | Cycle 6 — dialog, form and wiring               |
| `index.html`                                                | Cycle 6 — only if the dialog needs CSS          |
| `docs/02_spec.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md` | Cycle 7 — doc sync                              |

## TDD build cycles

Test first, as in every plan before this one. Write the failing test. Watch it
fail for the correct reason. Write the least code that makes it pass. Make one
commit per cycle.

**Before cycle 1:** this document exists. `src/settings/` does not exist. All
tests pass.

1. **`choicesFor`.** Fixture: `choicesFor(["zeta", "alpha", "mid"], "alpha")`
   returns `zeta` unchecked, `alpha` checked, `mid` unchecked, in that order.
   Use names that are not real renderer names, so a hardcoded list fails. Put
   the checked name in the middle, so "first is checked" fails.
2. **A key that is not Esc does nothing.** Fake dialog closed. Send
   `{ code: "KeyA" }`. Assert: no `showModal`, no `control.stop`, no
   `preventDefault`.
3. **Esc on a closed dialog opens the menu.** Fake dialog closed. Send
   `{ code: "Escape" }`. Assert: `showModal` called once, `control.stop` called
   once, `preventDefault` called once.
4. **Esc on an open dialog does nothing.** Fake dialog with `open: true`. Send
   `{ code: "Escape" }`. Assert: no `showModal`, no `control.stop`, no
   `preventDefault`. A second `showModal` on an open dialog is an error, and a
   `preventDefault` here stops the browser from closing the dialog.
5. **The dialog `close` event restarts firework input.** Fire the fake
   dialog's `close` listener. Assert: `control.start` called once. This one
   event covers Esc, Cancel and Apply.
6. **Wiring — UNTESTED.** Same as every `main.ts` cycle before it. The
   `deniedCodes` change has one test.
   - Add `"Escape"` to `deniedCodes` in `src/control/config.ts`. The test
     goes first, in `keyboard.test.ts`: `interpretKeyEvent` with
     `code: "Escape"` returns `{ input: null, preventDefault: false }`. The
     existing deny-list test uses `ShiftLeft`. It does not fail if someone
     removes Escape from the default list.
   - Keep `name` from both `selectRenderer` calls. Today `main.ts` keeps only
     `create`.
   - Build `<dialog>` → `<form method="get">`. Add one `<fieldset>` with a
     `<legend>` per group. Fill each group with radios from `choicesFor`.
     Take the names from `Object.keys(renderers)` and `Object.keys(soundSets)`.
   - Add an Apply `<button type="submit">` and a Cancel button with
     `formMethod = "dialog"`.
   - Call `attachSettingsMenu({ dialog, keyTarget: window, control: layer })`.
   - Change the instruction line to "Press any key. Press Esc for settings.
     Open the console to see events."
   - Add CSS to `index.html` only if the dialog is hard to read on the dark
     page.
7. **Doc sync.** Add Escape to the deny-list in `docs/02_spec.md`. Add the
   settings menu to the `CLAUDE.md` Status section. Update `README.md` and
   `CHANGELOG.md`.

## Verification

Each cycle:

```bash
npx vitest run --reporter=agent --no-isolate --fsModuleCache src/settings
```

Before each commit, all of these must pass: `npx vitest run`, `npx tsc`,
`npx eslint .`, `npx prettier --check .`, `npx knip`. The Husky hook runs most
of them.

Manual checks in `npm run dev`, after cycle 6:

1. Press Esc. The dialog opens. No firework launches.
2. Press Tab. Focus moves between the radios and the buttons. No firework
   launches.
3. Press Esc. The dialog closes and stays closed.
4. Press a letter. A firework launches.
5. Open the menu. Pick `pixel` and `silly`. Press Apply. The URL becomes
   `?renderer=pixel&sound=silly`, and the pixel renderer runs.
6. With `?renderer=pixel`, open the menu. The dialog shows above the canvases.
7. Load `?renderer=foo`. Open the menu. `ascii` is checked.
8. Open the menu. Press Cancel. The dialog closes, and keys launch fireworks
   again.

## Out of scope

- A live renderer swap with no reload. This needs a `dispose` step on
  `Renderer` and a rebuild of the AudioVisual layer.
- Settings in `localStorage`.
- A pause of the simulation while the menu is open.
- Settings other than renderer and sound, for example volume or mute.
- A menu drawn by a renderer.
- A gamepad or MIDI path to the menu.

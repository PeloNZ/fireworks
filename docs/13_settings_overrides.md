# 13. Settings in one place, saved overrides, a POST settings form

Status: steps 1 and 2 are built (cycles 1 to 5). The step 3 plan is approved. Cycles 6 to 11 are not started.

## Context

The default settings were in four files: `control/config.ts`, `action/config.ts`, `action/worldConfig.ts` and `audiovisual/config.ts`. A user could change only `?renderer=` and `?sound=`, through the GET form in the Esc menu (`docs/10_settings_ui.md`).

The goal is unlimited experimentation. The user changes a setting in the Esc menu, and the browser keeps it.

The order of work is fixed:

1. Put every default in one file in the code. **Built.**
2. Let an outside source (`localStorage`) override the defaults. **Built.** Nothing writes to `localStorage` yet, so for now a person sets a value from devtools.
3. Make the settings form POST, so that no setting goes in the URL.

## Decisions

1. **Scope of the form.** The form edits `world.gravity.y`, `world.wind.x` and `world.drag`, and the renderer and sound radios. Gravity x and z, wind y and z, `stepMs` and every other value stay in code for now. The world draws in x and y, and gravity acts vertically and wind horizontally.
2. **One tree.** `src/config.ts` holds every default value. Each layer keeps its own config type in its own `config.ts`. A layer still imports only its own type.
3. **Checks.** Each saved value must have the same type as its default. If it does not, the default stays. The native `min`, `max` and `step` attributes of each range guard the inputs. A Defaults button clears what is saved. The code applies no other rule.
4. **Form elements.** The form uses only standard HTML: radio, range, submit, reset and button.
   - Gravity y is a vertical range. Wind x and drag are horizontal ranges.
   - Each range has tick marks (a `<datalist>`), a `<label>`, a step that can reach its default exactly and an `<output>` that shows its number.
   - Number, checkbox and text inputs are not used. No field needs them yet.
5. **POST.** The form has `method="post"`. A page script cannot read the body of a POST page load. The Vite dev server also passes only GET and HEAD requests to the page (`vite/dist/node/chunks/node.js`, the HTML fallback), and a static host has no POST handler. So a `submit` listener reads `FormData`, saves it and reloads the page. No value goes in the URL.
6. **This replaces doc 10.** Doc 10 decision 2 says "The URL is the only source of truth. No setting goes into `localStorage`." Its out-of-scope list rules out `localStorage` and settings other than renderer and sound. Step 3 reverses these. Doc 10 gets a note then.
7. **Apply replaces.** Apply saves exactly what the form sends. A key that was set only from devtools is lost on the next Apply.
8. **One public function.** `overridesFromForm` is not exported. Tests call `applySettingsForm` and read the result back through `loadSettings` on the same fake store.

## Key contracts

### Step 1 (built)

```ts
// src/config.ts
export interface Settings {
  // `loadSettings` names it, so it is exported
  readonly renderer: string; // "ascii"
  readonly sound: string; // "tones"
  readonly control: ControlConfig;
  readonly world: WorldConfig;
  readonly action: ActionConfig;
  readonly audiovisual: AudioVisualConfig;
}
export const defaultSettings: Settings; // deep-frozen
```

- The four default objects moved with their comments and their `Object.freeze` calls. No value changed.
- `renderer` and `sound` are the fallbacks that `main.ts` gives to `selectRenderer`. They were the literals `"ascii"` and `"tones"`.
- `defaultConfig`, `defaultWorldConfig`, `defaultActionConfig` and `defaultAudioVisualConfig` no longer exist.
- `main.ts` is the only non-test file that imports `defaultSettings`.

### Step 2 (built)

```ts
// src/settings/overrides.ts — pure
interface SettingsStore {
  // the slice of Storage that loadSettings uses
  getItem(key: string): string | null;
}
export function mergeOverrides<T>(defaults: T, overrides: unknown): T;
export function loadSettings(
  store: SettingsStore,
  defaults: Settings,
): Settings;
```

- The storage key is `fireworks.settings`. The value is JSON with the same nesting as `Settings`.
- `mergeOverrides` uses a saved value only when it has the type of its default:
  - A number must be finite. A string must be a string.
  - An object merges key by key, so a saved `gravity.y` keeps `gravity.x`.
  - A key with no default is ignored. The merge walks the keys of the defaults, so a `__proto__` key in saved JSON is never read.
  - A saved value that is not an object, where the default is an object, gives the default.
  - A list keeps its default, because nothing checks its items. A list is not saved yet.
- `loadSettings` gives the defaults when nothing is saved, when the text is not JSON, and when the store throws.
- `main.ts` builds the store as `{ getItem: (key) => localStorage.getItem(key) }`. The `localStorage` property is read inside the method, so a browser that throws on access gives the defaults.
- `settings.world` goes to both `createWorld` and `createAudioVisualLayer`. Sparks read `gravity` and `drag` on every frame. If only one place gets the saved value, shells and sparks fall at different rates.
- The renderer and sound still come from the URL. Their fallbacks are `defaultSettings.renderer` and `defaultSettings.sound`, not `settings.*`. `selectRenderer` throws if its fallback is not in its table, and a saved name is not checked against the table.

### Step 3 (not started)

```ts
// SettingsStore gains setItem and removeItem (still not exported)
interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function applySettingsForm(
  entries: Iterable<readonly [string, FormDataEntryValue]>,
  store: SettingsStore,
  defaults: Settings,
): "saved" | "cleared" | "none";
```

- The saved JSON holds only the fields the form sends.
- A form field name is the dotted path, for example `world.gravity.y`. The radios keep the names `renderer` and `sound`.
- Each path segment must be an own key of the defaults (`Object.hasOwn`). Otherwise the field is dropped.
- A value converts by the type of its default. A number field must parse as a finite number and must not be empty.
- The submit buttons have `name="command"`. Apply has `value="apply"`. Defaults has `value="defaults"`. Cancel has no name, so `applySettingsForm` returns `"none"`.

The ranges:

| Field                        | `min` | `max` | `step` | Ticks     | Default |
| ---------------------------- | ----- | ----- | ------ | --------- | ------- |
| `world.gravity.y` (vertical) | -60   | 60    | 1      | every 10  | -18     |
| `world.wind.x`               | -20   | 20    | 0.5    | every 5   | 1.5     |
| `world.drag`                 | 0     | 3     | 0.05   | every 0.5 | 0.3     |

Facts that shape the form code (not yet checked in a browser):

- `orient="vertical"` is a non-standard Firefox attribute. The standard way is CSS `writing-mode: vertical-lr` with `direction: rtl`, which puts `min` at the bottom.
- A range always has a value. The browser clamps it to `min` and `max` and snaps it to `step`, so `required` does nothing on a range. A saved value outside the range shows clamped.
- `input.list` is read-only in the DOM. The tick marks need `input.setAttribute("list", id)`.
- Reset restores the `value` and `checked` attributes. `radioGroup` sets the `.checked` property, so Reset would uncheck every radio. Use `defaultChecked` and `defaultValue`.
- Enter in a form submits with the first submit button in DOM order. Apply comes before Defaults, or Enter would clear the settings.
- A drag of `0` is safe. `sparks.ts` has a closed form for it.
- The renderer fallback becomes the default and the requested name becomes the saved one: `selectRenderer(settings.renderer, renderers, defaultSettings.renderer)`. An unknown saved name then falls back to the default and does not throw.

## File layout

| File                                                                                                      | Change                                                                             | Step |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| `src/config.ts` (new)                                                                                     | `defaultSettings`                                                                  | 1    |
| `src/control/config.ts`, `src/action/config.ts`, `src/action/worldConfig.ts`, `src/audiovisual/config.ts` | Types only                                                                         | 1    |
| `src/main.ts` and 29 test files                                                                           | Import `defaultSettings` and use `.control`, `.world`, `.action` or `.audiovisual` | 1    |
| `src/settings/overrides.ts`, `overrides.test.ts` (new)                                                    | Merge, load, form parsing, submit result                                           | 2, 3 |
| `src/main.ts`                                                                                             | Load saved settings. Build the POST form. Handle submit.                           | 2, 3 |
| `docs/10_settings_ui.md`, `README.md`, `CHANGELOG.md`                                                     | Note that this doc replaces doc 10 decision 2                                      | 3    |

Docs 03 to 07 and doc 11 still name the old defaults (`defaultActionConfig` and others) in their cycle-by-cycle text. That text records how each layer was built at the time. The file-layout lines in docs 03, 04 and 05 now point to `src/config.ts`.

## TDD build cycles

Rules for every cycle:

- Write one failing test, watch it fail for the right reason, then write the least code that passes.
- Use unusual values, for example drag `0.77` and gravity y `-4.5`, so that a hard-coded default fails.
- Before each commit, `npx vitest run --reporter=agent --no-isolate --fsModuleCache`, `npx tsc`, `npx eslint .`, `npx prettier --check .` and `npx knip` must be clean.

### Step 1: centralise

1. **`src/config.ts`.** A move with no new test. A config object has no logic to test.
   - A script cut the four default objects out of their files and wrote them into `defaultSettings`.
   - The same script rewrote each importer. `defaultConfig` became `defaultSettings.control`, `defaultWorldConfig` became `defaultSettings.world`, `defaultActionConfig` became `defaultSettings.action` and `defaultAudioVisualConfig` became `defaultSettings.audiovisual`.
   - Proof that only the place changed:
     - The suite stays at 519 passing tests.
     - A throwaway script compared the old and the new objects with `deepStrictEqual`. All four are equal and still deeply frozen.
     - The 30 changed test files, with whitespace and trailing commas ignored, are identical to the old files after the rename.

### Step 2: override from `localStorage` (built)

2. `mergeOverrides`: a saved value replaces its default. Two tests: a top-level number, then a nested one. `{ world: { gravity: { y: -4.5 } } }` changes y and keeps x and z. The second test failed against the first version, which merged only one level.
3. `mergeOverrides`: a value of the wrong type keeps the default. Tests, each written and seen to fail first:
   - A string, `NaN`, `Infinity`, `null`, a boolean and an object for a number all keep the default. (`null` is in the list because `JSON.stringify` turns `NaN` and `Infinity` into `null`.)
   - An unknown key is dropped, and so is a `__proto__` key from `JSON.parse`. Both tests failed before the merge walked the keys of the defaults.
   - A saved `null` or `undefined`, where the default is an object, gave a `TypeError`. It now gives the default. A string, a number and a list were already safe.
   - A string default takes only a string. A list keeps its default.
4. `loadSettings`: reads `fireworks.settings`, parses it and merges it. A missing key, bad JSON and a `getItem` that throws all give the defaults. The missing-key test passed before the code for it, because `JSON.parse(null)` returns `null`. The code now checks for `null` itself.
5. Wiring in `main.ts` (untested, as in doc 10 cycle 6). `settings` replaces `defaultSettings` in every layer call. A throwaway script ran the same store with a working `localStorage`, an empty one and a `localStorage` getter that throws. The results were the saved gravity, the defaults and the defaults.

### Step 3: the POST form (not started)

The fake store in the tests is a plain object over a `Map`.

6. `applySettingsForm`, Apply saves a number: `[["command","apply"],["world.drag","0.77"]]` returns `"saved"`, and `loadSettings` on the same store gives drag `0.77`.
7. Nested paths and strings: `world.gravity.y = "-4.5"` keeps gravity x and z. `renderer = "neon"` stays a string.
8. Dropped fields: an empty number (because `Number("")` is `0`), `"abc"`, an unknown name, `__proto__.x`, a path past a number (`world.drag.x`) and a path that ends on an object (`world.gravity`).
9. Defaults and Cancel: `command=defaults` removes the key and returns `"cleared"`. No `command` returns `"none"` and leaves the store alone. A `setItem` that throws still returns `"saved"`.
10. The form in `main.ts` (untested):
    - Both `URLSearchParams(location.search)` reads go. `selectRenderer(settings.renderer, renderers, defaultSettings.renderer)`, and the same for sound.
    - `method="post"`. `radioGroup` sets `defaultChecked`.
    - A `rangeField(...)` helper next to `radioGroup`: `<label>`, `<input type="range">` with `defaultValue`, a `<datalist>` for the ticks and an `<output>`. One `input` listener on the form updates each `<output>`.
    - A `.vertical` rule in the `<style>` block of `index.html` for the gravity range.
    - Buttons in this order: Apply, Defaults (`formNoValidate`), Reset (`type="reset"`) and Cancel (`formMethod="dialog"`, `formNoValidate`, no name). Cancel also fires `submit`, so without `formNoValidate` a bad field would keep the dialog open.
    - The `submit` listener calls `applySettingsForm(new FormData(settingsForm, event.submitter), store, defaultSettings)`. On `"saved"` or `"cleared"` it calls `preventDefault()` and `location.reload()`.
    - The store's three methods each call `localStorage` inside themselves.
11. Doc sync: doc 10, `CLAUDE.md`, `README.md`, `CHANGELOG.md`, then the `doc-sync` agent.

## Verification

```bash
npx vitest run --reporter=agent --no-isolate --fsModuleCache && npx tsc && npx eslint . && npx prettier --check . && npx knip && npm run build
grep -rnwE "defaultConfig|defaultWorldConfig|defaultActionConfig|defaultAudioVisualConfig" src/   # empty
```

After step 3, also:

```bash
grep -rn "location.search\|URLSearchParams" src/   # empty
```

## Manual checks

Step 1: `npm run dev` looks and plays as before, in each of `?renderer=ascii`, `emoji`, `pixel` and `neon`.

Step 2 (nothing writes to `localStorage` yet, so set it from devtools):

- Run `localStorage.setItem("fireworks.settings", '{"world":{"gravity":{"y":-5}}}')` and reload. Shells and sparks fall slowly.
- Run `localStorage.setItem("fireworks.settings", '{"world":{"drag":"fast"}}')` and reload. The page plays with the default drag.
- Run `localStorage.setItem("fireworks.settings", "{not json")` and reload. The page plays with the defaults.
- Run `localStorage.removeItem("fireworks.settings")` and reload. The page is back to the defaults.

After step 3:

- Esc. The gravity range is vertical with `min` at the bottom. All three ranges show ticks and their number.
- Move gravity to `-5` and press Apply. The page reloads, fireworks fall slowly and the URL has no query. Reload again. Gravity is still `-5`.
- Wind `-10`: shells and sparks drift left. Drag `0`: nothing slows.
- Press Enter in the form. It applies, and does not clear.
- Defaults reloads with gravity `-18`, wind `1.5` and drag `0.3`.
- Reset puts the ranges, their numbers and the radios back to their page-load values. The dialog stays open.
- Renderer `neon`, Apply: neon draws, and still draws after another reload.
- In devtools, save gravity y `500` and reload. The range shows `60`. The page runs with `500` until the next Apply.
- A private window loads with the defaults.

## Out of scope

- Any value other than `world.gravity.y`, `world.wind.x`, `world.drag`, renderer and sound in the form.
- Checkbox and text inputs.
- Module constants (`WILLOW_SPEED_FRACTION`, the bloom divisors, the voice constants).
- Rules beyond the type check and the input attributes.
- Applying a change without a reload. The sky still changes on each reload, as doc 10 accepted.
- Old `?renderer=` and `?sound=` links. Step 3 ignores them.

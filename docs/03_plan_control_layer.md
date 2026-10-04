# Fireworks game — Control layer build plan (v1)

See `01_intent.md` for the overall vision and `02_spec.md` for what the Control layer must do. This
document is the _how_: file layout, contracts, and an ordered list of test-driven build cycles for the
Control layer, an abstract controller adapter, and one concrete keyboard adapter.

**Out of scope here**: the `ControlEvent` consumer (the Action layer). Nothing in this plan interprets
events — it only produces and displays them. That boundary is deliberate; see "Why the layer stops at
emission" below.

This document assumes no prior game-dev or advanced-TypeScript background. Where a decision is specific
to this design, it's explained; ordinary web-dev concepts (functions, modules, `addEventListener`) are
not.

## Amendment to `02_spec.md`

While planning this build, one part of `02_spec.md` needed correcting: it originally placed keyboard
noise filtering (repeat filtering, ignoring standalone modifier keys, not hijacking Ctrl/Cmd shortcuts)
in the Control layer's core pipeline, with a `deniedCodes` list in the shared Config. That's now moved
into the keyboard adapter — see "Where noise filtering actually belongs" below for why. `02_spec.md` has
been updated to match (pipeline diagram, the deny-list section, the Config shape, and Resolved item #2).
Read `02_spec.md` as amended; this document does not restate the reasoning already there, only what's
different.

## File layout

```
src/control/
  types.ts              RawInput, ControlSignal, ControlEvent, ControlSource,
                         ControllerAdapter, ControlEventSink
  config.ts              ControlConfig (includes a `keyboard` sub-object); its frozen default is
                         `defaultSettings.control` in src/config.ts (docs/13_settings_overrides.md)
  signal.ts               buildSignal(raw, source, config) -> ControlSignal        [pure]
  history.ts              createHistory(config, now) -> { push, recent, clear }    [pure state machine]
  controlLayer.ts         createControlLayer({ adapter, config, now, sink })
  adapters/
    keyboard.ts           interpretKeyEvent(event, keyboardConfig) -> KeyDecision  [pure]
                           createKeyboardAdapter({ target, config })               [thin DOM shell]
  debug/
    format.ts             formatControlEvent(event) -> string                     [pure]
    consoleSink.ts         createConsoleSink(log = console.debug)
  index.ts                 public surface — what other layers are allowed to import
src/main.ts                dev harness: wires the keyboard adapter through the control layer to the
                            Action layer's sink (docs/04_plan_action_layer.md cycle 17), exposing the
                            running layer on `window` for poking in devtools
```

Every file above has a single job, and files marked `[pure]` take no DOM types and produce no side
effects — same inputs always give the same output. Those are the ones with the richest unit tests,
because they're the cheapest to test: no browser, no mocking, no timers, just call the function and
assert on the return value. The non-pure files (`keyboardAdapter`'s wiring, `consoleSink`) are kept
deliberately thin so there's as little untested surface as possible.

## Key contracts

```ts
// A device-neutral description of "something happened at this key/button/whatever".
// This is what an adapter produces — see "Why the adapter emits RawInput" below.
interface RawInput {
  code: string; // e.g. "KeyA" for keyboard; a future MIDI adapter might use "note:60"
  shift: boolean; // keyboard-specific today, but any adapter can set it; unused ones default false
  timestamp: number; // same clock domain as `now()` — see "Clock injection" in 02_spec.md
}

// What Control actually hands downstream. Built from a RawInput, but stamped with policy
// (source, intensity) that only Control's core is allowed to decide.
interface ControlSignal {
  id: string;
  shift: boolean;
  timestamp: number;
  intensity: number;
  source: ControlSource;
}

type ControlSource = "keyboard"; // widened when a second adapter exists

// The discriminated union from 02_spec.md — one member today, room for "chord" later.
type ControlEvent = { kind: "single"; signal: ControlSignal };

// The seam every adapter must fill. Deliberately tiny: two methods, no inheritance.
interface ControllerAdapter {
  readonly source: ControlSource;
  start(emit: (input: RawInput) => void): void;
  stop(): void;
}

// A sink is just a function. No interface, no class — see "Why a sink is a function" below.
type ControlEventSink = (event: ControlEvent) => void;
```

## Where noise filtering actually belongs

`02_spec.md` (as amended) still describes _what_ counts as noise — held-key repeats, standalone
modifier presses, Ctrl/Meta-held combinations that would hijack a browser shortcut. What changed is
_where_ that filtering happens.

Think about what `ControllerAdapter` promises: "give me a `target` and a config, and I'll call `emit`
with a `RawInput` for every meaningful press." Nothing in that promise mentions keyboards. If the
Control layer's core also had to know that `"ShiftLeft"` is a modifier to be dropped, that knowledge
would live in two places at once — the adapter _and_ the core — for no benefit. Worse, a future MIDI
adapter would inherit a `deniedCodes` list full of keyboard key names that mean nothing to a MIDI
device, and would have to either ignore it or awkwardly extend it.

So the rule is: **an adapter's job is to decide what counts as a meaningful press for its device, and
only emit those.** The keyboard adapter is the only file in this codebase allowed to know what
`"ShiftLeft"` or `event.repeat` mean. By the time the Control layer's core sees a `RawInput`, it has
already been filtered down to "this is a signal that matters" — the core's job is just to turn that into
a `ControlSignal` and remember it, never to second-guess whether it should exist.

## Why the adapter emits `RawInput`, not `ControlSignal`

It would be shorter to have the keyboard adapter build the final `ControlSignal` directly — it already
has the code, the shift state, and the timestamp. Resist that. `ControlSignal` carries two fields the
adapter should _not_ decide: `source` (which adapter this came from — obvious for keyboard, but the
point is the core assigns it, not the adapter itself) and `intensity` (currently always
`config.defaultIntensity`, but this is exactly the field `01_intent.md` reserves for a future
hold-to-charge feature). If every adapter stamped its own `source` and `intensity`, that's the same
policy duplicated once per adapter, with no guarantee two adapters agree. Centralizing it in
`buildSignal` means there is exactly one place that decides what a `ControlSignal` is, and every adapter
only has to answer "what got pressed, and when" — the question it's actually positioned to answer.

## Why a sink is a function, not a class

`ControlEventSink` is just `(event: ControlEvent) => void`. No `interface Sink { handle(event) }`, no
base class to extend. TypeScript's structural typing means any function with that shape satisfies the
type — `console.debug` doesn't, but `(e) => console.debug(formatControlEvent(e))` does, and so does an
anonymous arrow function in a test. Introducing a class here would add a layer of ceremony (instantiate
it, call a named method) to solve a problem — "plug in different output destinations" — that a plain
function already solves. This is a case where reaching for an interface + implementations, a very
natural instinct from OO web frameworks, would be over-engineering for what's needed.

## Why the formatter is separate from the sink

`formatControlEvent(event): string` takes a `ControlEvent` and returns one line of text. It doesn't call
`console.debug` itself — that's `createConsoleSink`'s only job, and it's a one-liner:
`(event) => log(formatControlEvent(event))`. The separation exists so the _text_ can be unit-tested
directly: `expect(formatControlEvent(fixture)).toBe('...')`, no spying on `console`, no capturing stdout.
It also means the debug surface can grow later (write to a `<pre>` element, send over a WebSocket to a
second screen) by writing a new one-line sink, never touching the formatting logic or its tests.

## Why a fake target beats jsdom

Testing `createKeyboardAdapter` needs _something_ that behaves like a DOM `EventTarget`. The usual web
answer is to pull in `jsdom` and test against a simulated `window`. This plan does the opposite: the
adapter's `target` parameter is typed as just `{ addEventListener; removeEventListener }` — the smallest
slice of `EventTarget` it actually uses — and tests construct a plain object with those two methods by
hand (a **port**, in the sense of "the boundary code depends on an abstraction it defines, and anything
matching that shape can be plugged in"). Likewise, `interpretKeyEvent` takes a plain object shaped like
`{ code, shiftKey, ctrlKey, metaKey, repeat, timeStamp }` rather than a real `KeyboardEvent`.

The payoff: tests run in plain Node, with no browser-emulation dependency to install, configure, or have
version-mismatch with real browsers. The cost, stated plainly: the _wiring_ — the few lines that actually
call `target.addEventListener('keydown', ...)` — is only lightly exercised by these tests, because a fake
target can't prove a real browser calls the listener the way we expect. That's why "Verification" below
still includes a real `npm run dev` check by hand; the unit tests prove the logic is right, the manual
check proves the wiring is real.

## Why the layer stops at emission

`ControlEventSink` is the last thing this plan builds. There is deliberately no code here that reads a
`ControlEvent` and decides "this means launch a firework" — that's the Action layer's job
(`resolveAction`, see `docs/04_plan_action_layer.md`). Keeping the boundary here means this plan's tests
can assert exactly one thing about output:
"did the right `ControlEvent` get produced/logged" — not "did the right _firework_ happen," which would
require Action to exist and would make a Control-layer test failure and an Action-layer test failure
look the same from the outside.

## Config

```ts
interface ControlConfig {
  defaultIntensity: number; // 1.0
  historyMaxEntries: number; // 16
  historyMaxAgeMs: number; // 2000
  keyboard: {
    deniedCodes: readonly string[]; // ShiftLeft, ShiftRight, ControlLeft, ControlRight,
    // AltLeft, AltRight, MetaLeft, MetaRight, CapsLock
  };
}
```

`keyboard.deniedCodes` moved here (nested, not top-level) to match "Where noise filtering actually
belongs" above: it's read by the keyboard adapter only, and a config shape that puts it under a
`keyboard` key makes that ownership visible just from reading the type, without needing to check where
it's consumed.

## TDD build cycles

Test-driven means: for each numbered item, write the failing test(s) first, then the minimum code to
pass, then move on. Cycles are ordered so every pure unit is written and proven before any DOM code
exists — by the time cycle 5 needs a "fake browser," cycles 1–4 have already established what correct
output looks like.

**Setup (before cycle 1) — done:**

1. `npm install -D vitest`, add `"test"` / `"test:run"` scripts to `package.json`.
2. `tsconfig.json`: `"strict": true`, plus the strict flags `strict` alone doesn't cover —
   `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`,
   `noPropertyAccessFromIndexSignature`, `forceConsistentCasingInFileNames`.
3. Install and configure a linter and a dead-code checker, so problems `tsc` can't see (unsafe `any`,
   floating promises, unreachable exports) are caught before they're written, not after — the TypeScript
   ecosystem's nearest equivalents to PHPStan and Rector. See "Linting and static analysis" below for
   what was chosen and why.
4. Ran `npx tsc`, `npx eslint .`, and `npx knip` against the untouched scaffold. `tsc` came back clean —
   the scaffold already survives full `strict` unmodified. ESLint reports 4 errors, all in the pre-existing
   Vite demo files (`src/counter.ts`, `src/main.ts`) — expected, since they predate this tooling; they get
   stubbed out before `main.ts` is rewritten as the dev harness in the last cycle, not fixed now. `knip`
   reports nothing to remove.

## Linting and static analysis

TypeScript's compiler (even under `strict`) only catches what its type system is designed to catch. Two
further tools are added, matching the spirit of a PHP toolchain's PHPStan (static analysis beyond the
type checker) and Rector (automated detection of dead/removable code) — there's no line-for-line
equivalent of either in this ecosystem, but these are the closest fits:

- **ESLint + `typescript-eslint`**, configured with the `strictTypeChecked` and `stylisticTypeChecked`
  rule sets (`eslint.config.js`). "Type-checked" here means these rules don't just look at syntax — they
  ask the TypeScript compiler questions about each expression's actual type, which is what lets a rule
  catch things like "this value is typed `any` because it silently escaped a type" or "this promise is
  never awaited." That's the PHPStan-shaped value: analysis a plain type-checker pass doesn't do.
- **`knip`** (`knip.json`), which starts from the app's real entry point (`src/main.ts`) and reports
  exports, files, and dependencies nothing reachable from there actually uses. It's the closest fit to
  Rector's "find code that shouldn't be here" role, though Rector also _rewrites_ code to modernize it —
  knip only finds candidates for removal, it doesn't rewrite anything itself.

Both run via `npm run lint` / `npm run knip`, and both are meant to be run often during the TDD cycles
below, not just once at the end.

**Cycles:**

1. **`buildSignal(raw, source, config)` — done.** Asserts the returned `ControlSignal` has all five fields;
   `id`/`shift`/`timestamp` pass through from `raw` unchanged; `intensity` always equals
   `config.defaultIntensity`; `source` equals the `source` argument, not something the function invents.
2. **`interpretKeyEvent(event, keyboardConfig)` — done.** The noise-filtering rules from `02_spec.md`, as
   unit tests against plain fixture objects: `repeat: true` → no input; codes in `deniedCodes` alone → no
   input; `ctrlKey`/`metaKey` held with any code → no input (so Cmd+R survives); ordinary letters,
   digits, Tab, and arrow codes → an input is produced; `shiftKey` is captured into `shift`. Also assert
   the `preventDefault` decision (true for Tab/Space/arrows) without the function calling anything —
   it returns a plain decision object; the caller acts on it. This split is what keeps the function pure:
   a function that reaches out and calls a browser API is no longer "just compute a value from inputs."
   One refinement made while writing the tests: `preventDefault` is forced to `false` whenever
   `ctrlKey`/`metaKey` is held, even for a navigation code like Tab — otherwise "Cmd+R survives" would
   still leave a real shortcut like Ctrl+Tab (switch browser tabs) suppressed. `KeyboardConfig` was
   promoted from an inline shape in `config.ts` to a named export here, since this is the cycle that
   finally needs to name it.
3. **`createHistory(config, now)` — done.** Push more than `historyMaxEntries` and confirm the oldest
   drop off; advance a fake clock past `historyMaxAgeMs` and confirm stale entries are gone on the next
   read; `clear()` empties it; `recent()` returns entries oldest-to-newest and doesn't let a caller
   mutate the internal array (return a copy or a frozen array — a caller holding a live reference into
   internal state is a common way encapsulation quietly leaks). Built with a copy, not a frozen array:
   `recent()` returns `[...entries]`, so a caller mutating the result never touches stored state, but
   the returned array itself is not frozen — a plain copy was enough to satisfy the requirement without
   the extra step of freezing it too. Age-based eviction runs inside `recent()`, at read time, against
   `now()` — never inside `push()` — so a signal can go stale with no new push to trigger the check.
4. **`formatControlEvent(event)` — done.** One deterministic string per fixture event; assert the exact
   string, not just "contains X", so a future accidental format change is caught immediately. Format:
   `single KeyA shift=true intensity=1 source=keyboard t=1234`. `ControlEvent` moved from types.ts's
   deferred list to a real export here, since this cycle is its first consumer. No `switch` on
   `event.kind`: with one union member, a switch is a branch that never branches, and ESLint's
   `no-unnecessary-condition` said so — the function just reads `event.kind` directly into the string.
5. **`createKeyboardAdapter({ target, config })` — done.** Using the fake `target` from "Why a fake
   target beats jsdom": `start(emit)` registers a `keydown` listener; firing a synthetic event that
   `interpretKeyEvent` would accept results in `emit` being called with the matching `RawInput`; firing
   one it would reject results in no call; `stop()` removes the listener (assert
   `removeEventListener` was called with the same handler `addEventListener` received). `config` here is
   `KeyboardConfig`, not the whole `ControlConfig` — the adapter only ever hands it to
   `interpretKeyEvent`, which only reads `deniedCodes`; there's no reason for it to also carry
   `defaultIntensity` or the history settings, which are Control-core concerns. One addition beyond the
   plan's original wording: the adapter also has to call `event.preventDefault()` when
   `interpretKeyEvent`'s decision says to — cycle 2 built that decision, this cycle is what finally acts
   on it. Doing that needed a slightly larger event shape than `interpretKeyEvent`'s own `KeyEventLike`
   (which deliberately has no `preventDefault`, so the pure function can never reach into the DOM): a new
   `KeyboardListenerEvent` extends `KeyEventLike` with one function-typed `preventDefault` field. It's a
   property, not a method signature — `readonly preventDefault: () => void`, not
   `preventDefault(): void` — because ESLint's `no-unbound-method` rule flags a plain method reference as
   unsafe to detach from its object (it might depend on `this`), and this codebase's tests do exactly
   that (`expect(event.preventDefault).toHaveBeenCalledTimes(1)`) purely to inspect a spy's call record.
   `ControllerAdapter` moved from the deferred list in `types.ts` to a real export, since this is its
   first consumer.
6. **`createControlLayer({ adapter, config, now, sink })` — done.** Wire a fake adapter (not the real
   keyboard one) and a recording sink. Feed a sequence of `RawInput`s through the fake adapter's `emit`
   and assert: the sink receives one `{ kind: 'single', ... }` event per input, in order; the signal
   fields match what `buildSignal` would produce; and — the determinism check that matters for the
   multiplayer seam in `01_intent.md` — running the exact same input list through a fresh layer twice
   produces byte-identical output both times, checked on both the sink's recorded calls and `recent()`.
   `ControlEventSink` moved from types.ts's deferred list to a real export here, its first consumer.
   `createControlLayer`'s return value (`start`/`stop`/`recent`) has no exported name of its own yet —
   nothing outside this file needs to name the shape, only use the value cycle 7's dev harness will get
   back from calling this function.

**Wiring, after the cycles above are green:**

7. **`src/main.ts` becomes the dev harness — done.** Creates a real `createKeyboardAdapter` against
   `window`, wires it through `createControlLayer`, and assigns the running layer to
   `window.controlLayer` via a `declare global { interface Window { ... } }` augmentation, so it's fully
   typed for devtools poking rather than reached through a cast. This file is intentionally not unit
   tested — it's wiring, proven by the manual check in Verification, not by an automated test (see "Why a
   fake target beats jsdom" for why that tradeoff is acceptable here). This is also where
   `src/counter.ts`, `src/style.css`, and `src/assets/*` — the Vite demo content this file replaces —
   were deleted. `createControlLayer`'s `sink` here is `createActionLayer({ world, config:
defaultActionConfig })` (`docs/04_plan_action_layer.md` cycle 17), not the `createConsoleSink` built
   in this cycle — that sink prints a raw `ControlEvent` and is not wired into `main.ts`.

   Two things worth naming from writing it:
   - `now: () => performance.now()`, not `now: performance.now`. The bare reference would detach
     `performance.now` from the `performance` object its implementation depends on — calling it would
     throw `TypeError: Illegal invocation` in a real browser. Same lesson as cycle 5's
     `no-unbound-method` fix, just not one ESLint can catch here, since `performance.now` is a browser
     built-in with no type in this codebase for the rule to flag.
   - `target: window` — cycle 5's plan entry left open whether a real `EventTarget` would actually
     satisfy the narrow `KeyboardEventTarget` port type. It does: `tsc` accepts `window` here with no
     cast, thanks to TypeScript's bivariant checking of method-shorthand parameters.

   `createConsoleSink(log = console.debug)` (`src/control/debug/consoleSink.ts`) was built alongside
   this cycle, test-first like everything else — it's a one-line function, but "small" isn't an
   exception to the TDD rule in `CLAUDE.md`.

8. **`createWindowFocusLoss` — done.** The "Buffer reset rule: focus/blur
   loss" in `02_spec.md` was specified but never built in cycle 7 — nothing
   called `history.clear()` from anywhere, and the Verification claim below
   about a confirmed blur check was wrong; it had passed only because
   `historyMaxAgeMs` (2000ms) had already dropped the entries before anyone
   looked. Added as a fourth port, `FocusLossSource`, the same two-method
   shape as `ControllerAdapter`: `createControlLayer` takes it as a required
   dependency, calls `history.clear()` when it fires, and stops it alongside
   the adapter. `createWindowFocusLoss({ windowTarget, documentTarget })`
   is the real implementation — window `blur`, and `visibilitychange` while
   `document.hidden` — covering both halves of the spec's rule in one file.
   Tests use fake targets, same idea as cycle 5's fake `EventTarget`. One
   thing carried over deliberately: the repeated-`start()` leak fixed by
   review in `9b4945e` is tested from the first cycle here, not found after
   the fact.

## Critical files

| Path                                | Purpose                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/control/types.ts`              | The cross-layer contract — the shapes everything else in this plan implements                                 |
| `src/control/config.ts`             | Single source of tunable values                                                                               |
| `src/control/signal.ts`             | Cycle 1                                                                                                       |
| `src/control/history.ts`            | Cycle 3                                                                                                       |
| `src/control/adapters/keyboard.ts`  | Cycles 2 and 5                                                                                                |
| `src/control/adapters/focusLoss.ts` | Cycle 8                                                                                                       |
| `src/control/controlLayer.ts`       | Cycle 6                                                                                                       |
| `src/control/debug/format.ts`       | Cycle 4                                                                                                       |
| `src/control/debug/consoleSink.ts`  | Cycle 7 — one-liner, still test-first                                                                         |
| `src/control/index.ts`              | Re-exports the public surface only                                                                            |
| `src/main.ts`                       | Cycle 7 — replaces the Vite demo content; rewired to Action's sink in `docs/04_plan_action_layer.md` cycle 17 |

## Verification — done, confirmed in a real browser

- `npx vitest run` — every cycle's tests green, suite completes in well under a second (a sign no test
  is accidentally waiting on a real timer instead of a fake clock).
- `npx tsc` — clean under `strict`.
- `npm run build` — still produces a working `dist/`.
- Manual, in `npm run dev` — all confirmed working by a human tester:
  - Hold a letter key down: exactly one console line, not a stream of repeats.
  - Press `Cmd+R` (or `Ctrl+R`): the page reloads — confirms the adapter isn't swallowing browser
    shortcuts.
  - Press `Tab`: focus does not jump to the next element on the page.
  - From the devtools console, read `window.controlLayer`'s history after a few presses and confirm it
    matches what was logged.
  - Press a key, click away from the page and back, then read `window.controlLayer.recent()` within
    two seconds: it reads empty, confirming cycle 8's focus-loss clearing rather than the 2000ms age
    bound simply having expired the entries on its own — the original version of this check did not
    distinguish the two, and its result was not meaningful.

One console error was seen on load in Firefox: `Permission denied to access property "then"`. Not from
this codebase — nothing in `src/` uses `.then`, `Promise`, or `async`. Confirmed as a browser-extension
artifact (the error is Firefox's cross-realm security-boundary check, tripped by an extension's content
script probing the page): it disappeared in a Private Browsing window, where extensions are disabled by
default.

## Explicitly not in this plan

The Action layer (anything that reads a `ControlEvent` and decides what it means), AudioVisual, chords,
sequence pattern matching, hold-to-charge intensity, networking, and any non-keyboard adapter. This plan
produces signals and a way to see them — nothing consumes them yet.

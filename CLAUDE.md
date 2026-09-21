# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

`src/main.ts` is the dev harness for all three layers: it wires a real `createKeyboardAdapter` (against `window`) through `createControlLayer`, whose sink is the Action layer (`createActionLayer({ world, config: defaultActionConfig })`). A `requestAnimationFrame` loop clamps each frame's elapsed time to `AudioVisualConfig.maxFrameMs`, steps the world, logs each firework's phase changes to the console through `createSpecConsoleSink`, then calls the AudioVisual layer's `present({ entities, alpha, elapsedMs })` — `createAudioVisualLayer` with a `Renderer` drawing into a `<pre>` element, `createWebAudioSink` playing sound through a real `AudioContext` resumed from a `{ once: true }` `keydown` listener on `window`, and a `voicePlanner` deciding what a cue sounds like. Which renderer draws is a lookup in a `renderers` registry of named factories (`ascii`, `emoji`), picked by `selectRenderer` reading `?renderer=` from the page URL and falling back to `ascii` for an unknown or missing name; the chosen name also becomes the `<pre>`'s CSS class. Which sound set plays is the same lookup against a second table, `voices/sets.ts`'s `soundSets` (`tones`, `silly`), reading `?sound=` and falling back to `tones`. It also draws the one page-load backdrop seed (`hashString` of `Date.now()` plus `Math.random()`) and passes `buildBackdrop`'s result into the chosen renderer's factory, which rasterises it once and composites every frame over it — `src/audiovisual/` itself stays free of `Math.random`, `Date.now`, `performance.now` and `location` calls, and this is the file that keeps it that way. It assigns the running control layer to `window.controlLayer` and the running world to `window.actionWorld`, for poking from devtools. It renders two lines of instructional text plus the chosen renderer's grid into `#app` and is otherwise not unit tested — see `docs/03_plan_control_layer.md` cycle 7, `docs/04_plan_action_layer.md` cycle 17, `docs/05_audio_visual_layer.md` cycles 7 and 19, `docs/07_emoji_renderer.md` cycle 12, `docs/08_sound_effects.md` cycle 3, and "Why a fake target beats jsdom" for why that's the accepted tradeoff.

Application code lives under `src/control/` (see `docs/03_plan_control_layer.md`), `src/action/` (see `docs/04_plan_action_layer.md`), and `src/audiovisual/` (see `docs/05_audio_visual_layer.md`, plus `docs/06_world_backdrop.md` for the static sky, stars and ground, plus `docs/07_emoji_renderer.md` for the second, emoji-based renderer) for the build plan and cycle order of each.

`index.html` carries one `<style>` block: a dark page, `line-height: 1` on the `<pre>`, and `line-height: 1.2` on `pre.emoji`. All three are load-bearing rather than decoration — the brightness ramp assumes more ink means more light, so on the browser default of dark-on-white the whole grid reads inverted, and an emoji cell is close to square already at `line-height: 1`, unlike a monospace character cell, so the emoji grid needs its own ratio to stay square. See `docs/06_world_backdrop.md` and `docs/07_emoji_renderer.md`.

Tests run on Vitest: `npm test` (watch) or `npm run test:run` (single run).

## Commands

```bash
npm install
npm run dev           # Vite dev server with HMR
npm run build         # tsc (typecheck only) && vite build
npm run preview       # serve the built dist/
npm run typecheck     # tsc, no build
npm test              # vitest, watch mode
npm run test:run      # vitest, single run
npm run lint          # eslint .
npm run lint:fix      # eslint . --fix
npm run format        # prettier --write .
npm run format:check  # prettier --check .
npm run knip          # unreachable-export / dead-code check
```

`vite ^8.3.0` and `typescript ~6.0.2` float in `package.json`; `package-lock.json` pins the versions actually installed.

## Development tactic: TDD only

All application code (`src/control/**` and beyond) is written test-first. This is mandatory, not a preference — see `docs/03_plan_control_layer.md` for the cycle-by-cycle build order it applies to.

- **Red before green, every time.** Write the test against code that doesn't exist yet, run it, and confirm it fails for the right reason (missing module, wrong value — not a typo in the test itself). Only then write the implementation.
- **Minimum code to pass.** No branches, fields, or exports beyond what the current failing test requires. If it isn't tested, it isn't written yet.
- **One behavior per cycle, one commit per cycle.** Don't fold multiple functions' tests into a single red/green pass.
- **Assert against something a shortcut would fail.** E.g. drive a config-derived value with an unusual config value, not its default — a hardcoded implementation can fake the default but not an arbitrary one.
- **No real time, no real DOM in tests.** Inject a clock (`now: () => number`) rather than reading it inside logic under test; use plain fake objects ("ports") shaped like the slice of `EventTarget`/`KeyboardEvent` actually used, rather than pulling in `jsdom`.
- **Types and config objects aren't test-driven themselves** — there's no logic to test — but don't add or export one before a tested function needs it. An unused export is a defect `knip` will flag, not a "for later." Grow the shared contract (`src/control/types.ts`) one cycle at a time.
- **Before every commit**, `npx vitest run`, `npx tsc`, `npx eslint .`, `npx prettier --check .`, and `npx knip` must all be clean on the code just written. Pre-existing failures elsewhere are left alone, not fixed as a drive-by. A pre-commit git hook (Husky, `.husky/pre-commit`) now enforces most of this automatically:
  - `lint-staged` runs on staged files only: Prettier formats them (writes fixes, re-stages), then ESLint checks them (no `--fix` — a real error blocks the commit). Scoping ESLint to staged files, not the whole project, is what lets a pre-existing failure elsewhere sit unfixed: its errors only block a commit that actually touches that file.
  - `npx tsc`, `npx vitest run`, and `npx knip` then run against the whole project, same as the manual checklist — any failure blocks the commit.
  - `npx prettier --check .` isn't run separately — `lint-staged`'s `--write` step already guarantees every staged file is formatted before the other checks see it.
  - These full-project steps read the working tree, not the git index — an unstaged edit sitting alongside a partial `git add` can still affect their result, unlike `lint-staged`'s per-file, staged-content-only checks.

## Gotchas

- **`npm run dev` does not typecheck.** Vite only strips types; `tsc` runs in `build`. With `noUnusedLocals` and `noUnusedParameters` on, an unused import or variable passes `dev` and fails `build`. Run `npx tsc` to check without building.
- **`tsc` never emits** (`noEmit: true`) — Vite does all bundling.
- **`erasableSyntaxOnly: true`**: no `enum`, no `namespace`, no constructor parameter properties.
- **`strict` is on** in `tsconfig.json`, plus flags `strict` alone doesn't cover: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature`, `forceConsistentCasingInFileNames`.
- **Imports carry explicit `.ts` extensions** (`import { defaultConfig } from './control/config.ts'`) under `allowImportingTsExtensions`. Match this in new files.
- **`npm install` installs the git hook.** Its `prepare` script runs `husky`, which points git's `core.hooksPath` at `.husky/`. A fresh clone has no working pre-commit hook until `npm install` has run once.

## Assets

There is no `vite.config.ts`, so Vite defaults apply. `public/` is copied verbatim and referenced by root-absolute URL: `public/favicon.svg` is referenced via `/favicon.svg` in `index.html`. `public/icons.svg` is an SVG sprite (`<svg><use href="/icons.svg#icon-id"></use></svg>`) that nothing in `src/` currently references. There is no `src/assets/` directory; a file placed there would be `import`ed as a module, with the resulting URL content-hashed at build time.

`index.html` is the Vite entry point and loads `/src/main.ts`, which renders into `#app` via direct DOM calls (`document.createElement`, `.append(...)`), not by assigning an HTML string.

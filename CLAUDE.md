# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This is an **unmodified Vite `vanilla-ts` scaffold** — no application code has been written yet. The hero image, Vite/TypeScript logos, counter button, and "Documentation / Connect with us" sections in `src/main.ts`, plus all of `src/style.css`, are Vite's starter demo content. Treat them as placeholder to replace, not as load-bearing code to preserve.

There is no git repository, no README, and no test runner — so there is no test command to run.

## Commands

`node_modules` is absent and there is no lockfile (`vite ^8.3.0`, `typescript ~6.0.2` float), so start with:

```bash
npm install
npm run dev      # Vite dev server with HMR
npm run build    # tsc (typecheck only) && vite build
npm run preview  # serve the built dist/
```

## Development tactic: TDD only

All application code (`src/control/**` and beyond) is written test-first. This is mandatory, not a preference — see `docs/03_plan_control_layer.md` for the cycle-by-cycle build order it applies to.

- **Red before green, every time.** Write the test against code that doesn't exist yet, run it, and confirm it fails for the right reason (missing module, wrong value — not a typo in the test itself). Only then write the implementation.
- **Minimum code to pass.** No branches, fields, or exports beyond what the current failing test requires. If it isn't tested, it isn't written yet.
- **One behavior per cycle, one commit per cycle.** Don't fold multiple functions' tests into a single red/green pass.
- **Assert against something a shortcut would fail.** E.g. drive a config-derived value with an unusual config value, not its default — a hardcoded implementation can fake the default but not an arbitrary one.
- **No real time, no real DOM in tests.** Inject a clock (`now: () => number`) rather than reading it inside logic under test; use plain fake objects ("ports") shaped like the slice of `EventTarget`/`KeyboardEvent` actually used, rather than pulling in `jsdom`.
- **Types and config objects aren't test-driven themselves** — there's no logic to test — but don't add or export one before a tested function needs it. An unused export is a defect `knip` will flag, not a "for later." Grow the shared contract (`src/control/types.ts`) one cycle at a time.
- **Before every commit**, `npx vitest run`, `npx tsc`, `npx eslint .`, and `npx knip` must all be clean on the code just written. Pre-existing failures elsewhere (e.g. the untouched Vite demo files) are left alone, not fixed as a drive-by.

## Gotchas

- **`npm run dev` does not typecheck.** Vite only strips types; `tsc` runs in `build`. With `noUnusedLocals` and `noUnusedParameters` on, an unused import or variable passes `dev` and fails `build`. Run `npx tsc` to check without building.
- **`tsc` never emits** (`noEmit: true`) — Vite does all bundling.
- **`erasableSyntaxOnly: true`**: no `enum`, no `namespace`, no constructor parameter properties.
- **`strict` is not set** in `tsconfig.json` (and there is no `extends`), so `strictNullChecks` and friends are off.
- **Imports carry explicit `.ts` extensions** (`import { setupCounter } from './counter.ts'`) under `allowImportingTsExtensions`. Match this in new files.

## Assets

There is no `vite.config.ts`, so Vite defaults apply and the two asset locations behave differently:

- `public/` is copied verbatim and referenced by root-absolute URL — `public/icons.svg` is an SVG sprite used via `<svg><use href="/icons.svg#github-icon"></use></svg>`, and `public/favicon.svg` via `/favicon.svg` in `index.html`. Adding an icon means editing the sprite.
- `src/assets/` files are `import`ed as modules, and the resulting URL is content-hashed at build time.

`index.html` is the Vite entry point and loads `/src/main.ts`, which renders the whole page by assigning an HTML string to `#app`.

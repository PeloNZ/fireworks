# Fireworks

A browser fireworks game. Press a key, a firework launches. Key sequences unlock special patterns. Built in TypeScript with raw WebGL2 for rendering and the Web Audio API for sound — no rendering or audio libraries.

See `docs/01_intent.md` for the full vision and the three-layer design (Control, Action, AudioVisual).

## Status

The Control layer is in progress. `src/control/` has a tested `buildSignal` function. The keyboard adapter, history buffer, event formatting, and the layer's wiring are not built yet — see `docs/03_plan_control_layer.md` for the build plan and cycle order.

The Action and AudioVisual layers do not exist yet.

`src/main.ts` and `src/style.css` still hold Vite's starter demo content. They get replaced when the Control layer's dev harness is wired (cycle 7 of the build plan).

## Commands

```bash
npm install
npm run dev        # Vite dev server with HMR
npm run build      # tsc (typecheck only) && vite build
npm run preview    # serve the built dist/
npm run typecheck  # tsc, no build
npm test           # vitest, watch mode
npm run test:run   # vitest, single run
npm run lint       # eslint .
npm run lint:fix   # eslint . --fix
npm run knip       # unreachable-export / dead-code check
```

## Development

All application code is written test-first. See `CLAUDE.md`'s "Development tactic: TDD only" section for the rules.

## Docs

- `docs/01_intent.md` — vision, gameplay loop, the three-layer design.
- `docs/02_spec.md` — the Control layer spec.
- `docs/03_plan_control_layer.md` — the Control layer's build plan and cycle order.
- `CLAUDE.md` — guidance for Claude Code working in this repo, including build gotchas.

# Fireworks

A browser fireworks game. Press a key, a firework launches. Key sequences unlock special patterns. Built in TypeScript with raw WebGL2 for rendering and the Web Audio API for sound — no rendering or audio libraries.

See `docs/01_intent.md` for the full vision and the three-layer design (Control, Action, AudioVisual).

## Status

The Control layer is built. `src/control/` has tested `buildSignal`, `interpretKeyEvent`, `createHistory`, `formatControlEvent`, `createKeyboardAdapter`, `createConsoleSink`, and `createControlLayer` functions — see `docs/03_plan_control_layer.md` for the build plan and cycle order.

The Action layer is built. `src/action/` has tested `hashString`, `createRandom`, `deriveSeeds`, the vector helpers (`add`, `scale`, `magnitude`, `normalise`), `pickLaunch`, `pickPattern`, `pickPalette`, `pickSound`, `buildFireworkSpec`, `createFirework`, `stepPhysics`, `stepPhase`, `createWorld`, `resolveAction`, `createActionLayer`, `formatFirework`, and `createSpecConsoleSink` functions — see `docs/04_plan_action_layer.md` for the build plan and cycle order.

`src/main.ts` wires the keyboard adapter through the control layer to the Action layer as its sink, steps the resulting world on a `requestAnimationFrame` loop, and logs each firework's phase changes to the console. It also draws that world every frame through the AudioVisual layer's ASCII renderer, into a `<pre>` element, and plays its sound through a real `AudioContext`, resumed on the first keydown. It exposes `window.controlLayer` and `window.actionWorld` for poking in devtools.

The AudioVisual layer is built. `src/audiovisual/` has tested `parseHexColor`, `lerpVec3`, `buildFrame`, `rasteriseFrame`, `createAsciiRenderer`, `createAudioVisualLayer`, `sparkDirections`, `sparkSpeeds`, `sparkPosition`, `expandBurst`, `createTrails`, `createPhaseWatcher`, `planVoices`, `createWebAudioSink`, and `createNoiseBuffer` functions, which turn Action's snapshot into an ASCII grid of a firework shell, its burst's sparks, and both their trails, plus a launch whoosh, a sustained flight whistle, and a burst bang synthesised through the Web Audio API — see `docs/05_audio_visual_layer.md` for the build plan and cycle order. Pass A (shells rendering to the grid), Pass B (sparks and trails), and Pass C (sound) are all complete: a burst expands into sparks that draw and fade, every moving thing — shell and spark alike — trails a fading streak behind it, and each firework launches, whistles while airborne, and bursts with its own distinct sound, `"soft"`, `"sharp"`, or `"crackle"`. This completes the AudioVisual layer's planned v1 scope.

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

Prettier formats; ESLint and knip catch bugs — the two don't overlap, so there's nothing to reconcile between them.

A pre-commit git hook (Husky + `lint-staged`) enforces this on every commit: it formats and lints staged files, then runs `tsc`, the test suite, and `knip` against the whole project. Any failure blocks the commit. It runs after `npm install`, so a fresh clone needs that once before the hook works.

## Development

All application code is written test-first. See `CLAUDE.md`'s "Development tactic: TDD only" section for the rules.

## Docs

- `docs/01_intent.md` — vision, gameplay loop, the three-layer design.
- `docs/02_spec.md` — the Control layer spec.
- `docs/03_plan_control_layer.md` — the Control layer's build plan and cycle order.
- `docs/04_plan_action_layer.md` — the Action layer's build plan and cycle order.
- `docs/05_audio_visual_layer.md` — the AudioVisual layer's build plan and cycle order.
- `CLAUDE.md` — guidance for Claude Code working in this repo, including build gotchas.

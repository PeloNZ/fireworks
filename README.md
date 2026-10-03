# Fireworks

A browser fireworks game. Press a key, a firework launches. Key sequences unlock special patterns. Built in TypeScript with raw WebGL2 for rendering and the Web Audio API for sound — no rendering or audio libraries.

See `docs/01_intent.md` for the full vision and the three-layer design (Control, Action, AudioVisual).

## Status

The Control layer is built. `src/control/` has tested `buildSignal`, `interpretKeyEvent`, `createHistory`, `formatControlEvent`, `createKeyboardAdapter`, `createConsoleSink`, and `createControlLayer` functions — see `docs/03_plan_control_layer.md` for the build plan and cycle order.

The Action layer is built. `src/action/` has tested `hashString`, `createRandom`, `deriveSeeds`, the vector helpers (`add`, `scale`, `magnitude`, `normalise`), `pickLaunch`, `pickPattern`, `pickPalette`, `pickSound`, `buildFireworkSpec`, `createFirework`, `stepPhysics`, `stepPhase`, `createWorld`, `resolveAction`, `createActionLayer`, `formatFirework`, and `createSpecConsoleSink` functions — see `docs/04_plan_action_layer.md` for the build plan and cycle order.

`src/main.ts` wires the keyboard adapter through the control layer to the Action layer as its sink, steps the resulting world on a `requestAnimationFrame` loop, and logs each firework's phase changes to the console. It also draws that world every frame through the AudioVisual layer's chosen renderer, into whatever element that renderer creates for itself, and plays its sound through a real `AudioContext`, resumed on the first keydown. The renderer is ASCII by default; loading the page with `?renderer=emoji`, `?renderer=pixel` or `?renderer=neon` draws the same world in emoji, 8-bit pixel art or glowing neon lines instead. It draws one page-load seed and builds the static backdrop from it, so every reload deals a new sky. Pressing Esc opens a settings menu, a native `<dialog>`, where the renderer and the sound set are picked from radio buttons; Apply reloads the page with `?renderer=` and `?sound=` set. It exposes `window.controlLayer` and `window.actionWorld` for poking in devtools.

The AudioVisual layer is built. `src/audiovisual/` has tested `parseHexColor`, `lerpVec3`, `buildFrame`, `rasteriseFrame`, `createAsciiRenderer`, `createAudioVisualLayer`, `sparkDirections`, `sparkSpeeds`, `sparkPosition`, `sparkVelocity`, `expandBurst`, `createTrails`, `createPhaseWatcher`, `planVoices`, `createWebAudioSink`, and `createNoiseBuffer` functions, which turn Action's snapshot into an ASCII grid of a firework shell, its burst's sparks, and both their trails, plus a launch whoosh, a sustained flight whistle, and a burst bang synthesised through the Web Audio API — see `docs/05_audio_visual_layer.md` for the build plan and cycle order. Pass A (shells rendering to the grid), Pass B (sparks and trails), and Pass C (sound) are all complete: a burst expands into sparks that draw and fade, every moving thing — shell and spark alike — trails a fading streak behind it, and each firework launches, whistles while airborne, and bursts with its own distinct sound, `"soft"`, `"sharp"`, or `"crackle"`. This completes the AudioVisual layer's planned v1 scope.

The world backdrop is built. `src/audiovisual/backdrop.ts` has tested `skyBrightnessAt`, `groundHeightAt`, `buildSky`, `buildBodies`, `buildGround`, and `buildBackdrop` functions, and `src/audiovisual/adapters/asciiBackdrop.ts` has tested `rasteriseBackdrop` and `overlayGrid` — see `docs/06_world_backdrop.md` for the build plan and cycle order. One seed drawn at page load gives a sky gradient (anywhere from solid black to a dim sunset), a scatter of stars with a moon and a planet, and a ground silhouette along the bottom; refreshing deals a new one. The backdrop is rasterised once, at renderer construction, and each frame composites over it — the fireworks win every cell they draw in, and the sky shows through the ones they leave blank, so nothing in the backdrop can ever dim a spark. A brighter horizon thins the star field, the way a real sunset does.

A second renderer is built: emoji, alongside ASCII. `src/audiovisual/color.ts` has tested `hueOf` and `saturationOf`; `src/audiovisual/adapters/cells.ts` has tested `toCell`, `rowCentreY`, `columnCentreX`, and `contestCells`, the geometry shared by both renderers; `src/audiovisual/adapters/emojiGrid.ts` has tested `sparkGlyph`, `rampGlyph`, `glyphFor`, `rasteriseEmojiFrame`, and `overlayEmojiGrid`; `src/audiovisual/adapters/emojiBackdrop.ts` has tested `rasteriseEmojiBackdrop`; `src/audiovisual/adapters/emoji.ts` has tested `createEmojiRenderer`; and `src/audiovisual/selectRenderer.ts` has tested `selectRenderer` — see `docs/07_emoji_renderer.md` for the build plan and cycle order. A spark's glyph is the coloured circle nearest its hue, so a red firework bursts into red circles and a green one into green, a fact the ASCII grid cannot show. Which renderer runs is a lookup by name in a registry, chosen by `?renderer=` in the page URL and defaulting to ASCII: `http://localhost:5174/?renderer=emoji` loads the same simulation into an emoji sky, and an unknown name falls back to ASCII rather than failing.

A third renderer is built: 8-bit pixel art on a `<canvas>`, filling the browser window. It reuses the emoji renderer's nearest-hue and brightness-ramp logic, generalised into `color.ts`'s `nearestHue` and a new `adapters/ramp.ts`'s `rampLevel`. `src/audiovisual/adapters/pixelGrid.ts` has tested `sparkIndex`, `indexFor`, `worldHalfWidth`, `pixelCentreX`, `toPixel`, `discCells`, and `paintFrame`; `src/audiovisual/adapters/pixelBackdrop.ts` has tested `paintBackdrop`; and `src/audiovisual/adapters/pixel.ts` has tested `toRgba` and `createPixelRenderer` — see `docs/09_8bit_renderer.md` for the build plan and cycle order. Colour is a fixed 16-entry palette borrowed from PICO-8 rather than RGB, and every sprite draws as the actual disc its radius describes instead of a single cell — the first renderer able to do either. A trail tapers and a spark shrinks as they fade, rather than staying full size. Loading the page with `?renderer=pixel` fills the whole browser window: the internal grid's row count is fixed and its column count is derived from the real window at load, so the world's full height always fits and a round burst stays round whatever shape the window is. The sky, stars, moon, planet and ground paint once onto their own canvas; a second canvas redraws only the fireworks each frame.

A fourth renderer is built: neon, smooth glowing lines on two stacked `<canvas>`es in Display P3 colour, on a screen as sharp as its real pixels. `src/audiovisual/adapters/neonScene.ts` has tested `toCanvas`, `neonFrame` and `neonBackdrop`, and `src/audiovisual/adapters/neon.ts` has tested `createNeonRenderer` — see `docs/12_neon_renderer.md` for the build plan and cycle order. A black sky holds cyan star crosses and a moon and planet drawn as thin rings. Over a glowing cyan ridge, every spark and shell is a streak along its own motion, and light that overlaps adds up towards white. A soft bloom spreads the light. Each `Sprite` now carries its `velocity`, which the streaks need. Loading the page with `?renderer=neon` shows it. Firefox has no Display P3 canvas, so it shows the same colours mapped into sRGB.

A settings menu is built. `src/settings/settingsMenu.ts` has tested `choicesFor` and `attachSettingsMenu` — see `docs/10_settings_ui.md` for the build plan and cycle order. Esc opens the menu and stops firework input while it is open; any way of closing the menu starts it again. The menu is app state, so the Control and Action layers never see a setting: the form is a plain GET form, and the browser writes the new URL and reloads. `Escape` is on the keyboard adapter's deny-list, so it never launches a firework.

Ambient movers are built. `src/audiovisual/ambient.ts` has tested `createAmbient`, `src/audiovisual/adapters/asciiGrid.ts` has tested `rasteriseAmbient`, and `src/audiovisual/adapters/emojiGrid.ts` has tested `rasteriseEmojiAmbient`, and `src/audiovisual/adapters/pixelGrid.ts` draws them in `paintFrame` — see `docs/11_ambient_movers.md` for the build plan and cycle order. About once in 20 seconds a shooting star streaks across the upper sky and fades, or a satellite crosses it slowly. Each kind waits 8 seconds after it appears, and at most 2 movers are in the sky at once. They draw behind the fireworks, so a firework always covers one. The chance is a rate per second, so a fast screen and a slow screen see the same number. All four renderers draw them. An emoji cannot dim, so a shooting star is 🌠 for its short life and a satellite is 🛸. The pixel renderer draws a small point of light that fades, with a tail behind a shooting star, and the movers cross its whole width on a wide window. The neon renderer draws a shooting star as a streak and a satellite as a dot, and both glow.

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
- `docs/06_world_backdrop.md` — the world backdrop's build plan and cycle order.
- `docs/07_emoji_renderer.md` — the emoji renderer's build plan and cycle order.
- `docs/09_8bit_renderer.md` — the 8-bit pixel renderer's build plan and cycle order.
- `docs/10_settings_ui.md` — the settings menu's build plan and cycle order.
- `docs/11_ambient_movers.md` — the ambient movers' build plan and cycle order.
- `PLAY_TESTING.md` — what people did and said when they played it.
- `CLAUDE.md` — guidance for Claude Code working in this repo, including build gotchas.

# Fireworks game — ambient movers build plan (v1)

See `05_audio_visual_layer.md` for the AudioVisual layer, `06_world_backdrop.md`
for the static sky, and `10_settings_ui.md` for the settings menu. Those
documents stay closed as their own v1 records. In this one, the cycle count
resets to 1.

## Context

The sky is static. `buildBackdrop` makes it once per page load. Each renderer
draws it once. Nothing in the sky moves.

This plan adds rare, random movers that cross the sky: a shooting star and a
satellite. They draw behind the fireworks and in front of the static backdrop.

## Decisions

The user made these decisions before anyone wrote this plan.

1. **v1 has movers only.** The kinds are a shooting star and a satellite. No
   firework event starts a mover in v1.
2. **Only the ascii renderer draws movers.** The emoji and pixel renderers
   ignore them.
3. **Movers are cosmetic.** The Control and Action layers do not change. A
   firework never touches a mover.
4. **A mover draws behind the fireworks.** A firework always covers a mover.
5. **The rate is about 1 spawn in 20 seconds.** The rate is a config value.
   A later menu setting can change it.
6. **Two limits make the events feel random.** A kind has a cooldown of 8
   seconds. At most 2 movers live at one time.
7. **A shooting star fades.** It has one cell and no tail. Its brightness
   falls to zero at the end of its time to live (ttl).
8. **A satellite crosses the full width.** Its brightness stays constant.

## Why a mover is not a Sprite

`Frame.sprites` feeds `contestCells`. That function gives each cell to the
brightest sprite (`adapters/cells.ts`). A mover in `sprites` could take a
cell from a fading trail. `06_world_backdrop.md` gives the same reason for
the backdrop.

So `Frame` gets a second list, `ambient`. The ascii renderer composites it
in its own pass.

```
backdrop (once) ──► ambient movers (each frame) ──► fireworks (each frame)
```

## Why the spawn chance is per second

A chance per frame depends on the frame rate. At 1 percent per frame, a 144
Hz screen spawns 2.4 times more movers than a 60 Hz screen.

The config states a rate per second. `createAmbient` converts it to a chance
for the frame, with the elapsed time of that frame:

```
chance = 1 − exp(−ratePerSecond × elapsedMs / 1000)
```

`present` already receives `elapsedMs`. `main.ts` clamps it to
`maxFrameMs`, so one slow frame cannot roll a large chance.

## Why a spawn rolls all its values once

`createAmbient` draws every random value at spawn, and keeps them in a fixed
record. After that, the position is a function of the age:

```
position = start + velocity × ageMs / 1000
```

`sparks.ts` works the same way. No per-frame random draw happens, so a test
needs no clock.

The order of draws is part of the contract. A test scripts the random
values in this order.

| Step | Shooting star | Satellite  |
| ---- | ------------- | ---------- |
| 1    | spawn roll    | spawn roll |
| 2    | kind          | kind       |
| 3    | x             | y          |
| 4    | y             | direction  |
| 5    | direction     | speed      |
| 6    | speed         | —          |
| 7    | ttl           | —          |

A step with `maxLive` movers alive makes no draw. A step with a kind in
cooldown makes steps 1 and 2 and stops.

## Where the random values come from

`src/audiovisual/` never calls `Math.random`. `main.ts` makes a seeded
generator:

```ts
createRandom(hashString(`${backdropSeed}:ambient`));
```

This matches the separate streams in `backdrop.ts` (`:sky`, `:bodies`,
`:ground`). `createAudioVisualLayer` receives it as `ambientRandom`.

## Key contracts

```ts
// src/audiovisual/types.ts
/** One ambient item for one frame. World space, like a Sprite. */
export interface Mover {
  readonly position: Vec3;
  readonly brightness: number; // 0..1
}

export interface Frame {
  readonly sprites: readonly Sprite[];
  readonly ambient: readonly Mover[];
}
```

```ts
// src/audiovisual/ambient.ts
export function createAmbient(options: {
  readonly config: AudioVisualConfig["ambient"];
  readonly random: () => number;
}): {
  /** Ages the live movers, removes the expired ones, maybe spawns one.
   * Returns the movers to draw this frame. */
  step(elapsedMs: number): readonly Mover[];
};
```

```ts
// src/audiovisual/adapters/asciiGrid.ts
/** One string, same size as the firework grid. A mover becomes one
 * character from the ramp. A mover outside the grid draws nothing. */
export function rasteriseAmbient(
  movers: readonly Mover[],
  ascii: AudioVisualConfig["ascii"],
): string;
```

## Config

`AudioVisualConfig.ambient`. All values are read-only.

| Field                     | Default      | Meaning                               |
| ------------------------- | ------------ | ------------------------------------- |
| `ratePerSecond`           | `0.05`       | About 1 spawn in 20 seconds           |
| `cooldownMs`              | `8000`       | Wait between two movers of one kind   |
| `maxLive`                 | `2`          | Most movers alive at one time         |
| `shootingStar.y`          | `[65, 95]`   | World y of the start                  |
| `shootingStar.speed`      | `[40, 70]`   | World units per second                |
| `shootingStar.descent`    | `0.5`        | Vertical speed = −descent × speed     |
| `shootingStar.ttlMs`      | `[400, 800]` | Time to live                          |
| `shootingStar.brightness` | `1`          | Brightness at spawn. It fades to zero |
| `satellite.y`             | `[80, 95]`   | World y of the whole path             |
| `satellite.speed`         | `[5, 9]`     | World units per second                |
| `satellite.brightness`    | `0.6`        | Constant                              |

A shooting star starts at an x drawn from the world width. Its direction is
left or right. A satellite starts at x = −50 or x = +50. It moves toward
the other edge. Its ttl is `100 / speed` seconds.

All start heights are above the highest ground point (14 units). Nothing
hides a mover behind the ridge.

## How the ascii renderer composites

`createAsciiRenderer` already holds `base`, the backdrop grid. Each frame it
makes the firework grid and joins the grids with `overlayGrid`:

```ts
overlayGrid(overlayGrid(base, ambientGrid), fireworkGrid);
```

`overlayGrid` keeps the foreground character unless it is a space. So a
mover replaces the sky. A firework replaces a mover.

`rasteriseAmbient` uses `toCell` for the position and `rampChar` for the
character. This keeps the rule "more ink means more light". A dim mover
is a faint character.

The emoji and pixel renderers do not read `Frame.ambient`. `?renderer=emoji`
shows no movers.

## File layout

| Path                                                                  | Role                                         |
| --------------------------------------------------------------------- | -------------------------------------------- |
| `docs/11_ambient_movers.md`                                           | This plan, written before cycle 1            |
| `src/audiovisual/types.ts`                                            | Cycle 1 — `Mover`, `Frame.ambient`           |
| `src/audiovisual/frame.ts`                                            | Cycle 1 — `buildFrame` returns `ambient: []` |
| the 8 test files that build a `Frame`                                 | Cycle 1 — add `ambient: []`                  |
| `src/audiovisual/adapters/asciiGrid.ts` and its test                  | Cycles 2–3 — `rasteriseAmbient`              |
| `src/audiovisual/adapters/ascii.ts` and its test                      | Cycle 4 — composite                          |
| `src/audiovisual/config.ts`                                           | Cycle 5 — `ambient` config                   |
| `src/audiovisual/ambient.ts` and `ambient.test.ts`                    | Cycles 5–11                                  |
| `src/audiovisual/audioVisualLayer.ts` and its test                    | Cycle 12 — `ambientRandom`                   |
| `src/main.ts`                                                         | Cycle 13 — seed and wiring                   |
| `docs/06_world_backdrop.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md` | Cycle 14 — doc sync                          |

## TDD build cycles

Test first, as in every plan before this one. Write the failing test. Watch
it fail for the right reason. Write the least code that makes it pass. Make
one commit per cycle.

Take expected values from the worked examples below. Never compute them with
the same formula as the code.

**Before cycle 1:** this document exists. `Frame` has no `ambient` field. All
tests pass.

1. **Refactor, no behaviour change.** Add `Mover` and `Frame.ambient`.
   `buildFrame` returns `ambient: []`. Add `ambient: []` to the 19 `Frame`
   literals in the 8 test files. All tests stay green. No new test.
2. **`rasteriseAmbient` draws a mover.** An 80×40 grid. A mover at (0, 50)
   with brightness 1. The result has `@` at row 19, column 40. Every other
   cell is a space.
3. **`rasteriseAmbient` clips.** A mover at x = 60 gives a grid of spaces.
   No error.
4. **The ascii renderer composites in order.** Use a fake target. A mover
   alone in a sky cell shows the mover character. A mover and a firework
   sprite in one cell show the firework character.
5. **Rate 0 never spawns.** Config rate 0. `random` always returns 0. Elapsed
   is 10 000 ms. `step` returns no mover. Add the `ambient` config here, with
   the test that first needs it.
6. **The spawn chance is per second.** Rate 1 per second. Elapsed 1000 ms.
   The chance is 1 − e⁻¹, about 0.632. A spawn roll of 0.63 spawns. A roll of
   0.64 does not.
7. **Shooting star motion.** Script the draws. Work out the start and the
   velocity by hand. After 500 ms the position is start + velocity × 0.5.
8. **Shooting star fade and end.** At half the ttl the brightness is 0.5.
   At the ttl the mover is gone.
9. **Satellite.** It starts at the edge on the drawn side. Its brightness
   stays 0.6. It is gone after `100 / speed` seconds.
10. **Cooldown.** A second mover of the same kind within 8000 ms does not
    spawn. After 8000 ms it does.
11. **Cap.** With 2 movers alive, no mover spawns and `random` is not called.
12. **The layer passes movers to the renderer.** Fake renderer. Scripted
    `ambientRandom`. `frame.ambient` holds the spawned mover. Update the 6
    `createAudioVisualLayer` call sites.
13. **Wiring — UNTESTED.** Same as every `main.ts` cycle. Seed the stream and
    pass `ambientRandom`.
14. **Doc sync.** Update `CLAUDE.md` Status, `docs/06_world_backdrop.md` (its
    "Out of scope" says motion does not exist), `README.md`, `CHANGELOG.md`.

## Verification

Each cycle:

```bash
npx vitest run --reporter=agent --no-isolate --fsModuleCache src/audiovisual
```

Before each commit, all of these must pass: `npx vitest run`, `npx tsc`,
`npx eslint .`, `npx prettier --check .`, `npx knip`. The Husky hook runs most
of them.

This command must print nothing:

```bash
grep -rE "Math.random|Date.now|performance.now" src/audiovisual/
```

Manual checks in `npm run dev`, after cycle 13:

1. Open the ascii renderer. Wait about 1 minute. Shooting stars and
   satellites appear.
2. A shooting star fades in the middle of the sky. A satellite crosses the
   full width.
3. Press a key when a mover is in the sky. A firework rises over the mover.
   The firework covers it.
4. Load `?renderer=emoji`, then `?renderer=pixel`. No movers appear. Nothing
   breaks.

## Out of scope

- **A rate the user can change.** Add a table `{ off, rare, normal, busy }`
  that maps a name to a rate. Read `?ambient=` with `selectRenderer`. Add a
  third radio group to the settings menu with `choicesFor`. `main.ts` then
  replaces `config.ambient.ratePerSecond`, in the same way it replaces the
  pixel `columns`. `src/audiovisual/` gets the rate as data. It never reads
  `location`.
- **A mover that a firework event starts**, for example a crowd wave on a
  burst. The phase watcher (`src/audiovisual/phases.ts`) already gives a
  `burst` cue. Roll the dice when that cue arrives.
- Movers that flap or blink (bats, birds, owl eyes). They need a list of
  drawings that changes with the age.
- Lightning, fog, clouds and moon phases. Lightning and fog change the whole
  sky, so each renderer must redraw its backdrop.
- Movers in the emoji and pixel renderers.
- A tail on a shooting star, and any drawing that is more than one cell.

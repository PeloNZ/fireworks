# Fireworks game — ambient movers build plan (v1)

See `05_audio_visual_layer.md` for the AudioVisual layer, `06_world_backdrop.md`
for the static sky, and `10_settings_ui.md` for the settings menu. Those
documents stay closed as their own v1 records. In this one, the cycle count
resets to 1.

Where a manual check below loads `?renderer=<name>`, open the menu with Esc, pick that renderer and
press Apply. The settings menu form replaced the URL parameter, as `13_settings_overrides.md`
describes.

## Context

The sky is static. `buildBackdrop` makes it once per page load. Each renderer
draws it once. Nothing in the sky moves.

This plan adds rare, random movers that cross the sky: a shooting star and a
satellite. They draw behind the fireworks and in front of the static backdrop.

Cycles 1 to 14 built the movers and the ascii renderer's drawing of them.
Cycles 15 to 19 add the emoji renderer's drawing of them.
Cycles 20 to 26 add the pixel renderer's drawing of them.

## Decisions

The user made these decisions before anyone wrote this plan.

1. **v1 has movers only.** The kinds are a shooting star and a satellite. No
   firework event starts a mover in v1.
2. **All three renderers draw movers.** (Cycles 1 to 14 built ascii only.
   Decisions 9 to 14 add emoji. Decisions 15 to 21 add pixel.)
3. **Movers are cosmetic.** The Control and Action layers do not change. A
   firework never touches a mover.
4. **A mover draws behind the fireworks.** A firework always covers a mover.
5. **The rate is about 1 spawn in 20 seconds.** The rate is a config value.
   A later menu setting can change it.
6. **Two limits make the events feel random.** A kind has a cooldown of 8
   seconds. At most 2 movers live at one time.
7. **A shooting star fades.** On the ascii and emoji renderers it has one cell
   and no tail. Its brightness falls to zero at the end of its time to live
   (ttl). Decision 18 gives it a tail on the pixel renderer.
8. **A satellite crosses the full width.** Its brightness stays constant.
9. **A mover has a kind.** `Mover` gets `kind: "shootingStar" | "satellite"`.
   An emoji cannot dim, so the emoji renderer cannot tell the two kinds apart
   by brightness. The type states the union once. `ambient.ts` and the emoji
   config both derive from it.
10. **A shooting star is 🌠 for its whole life on the emoji renderer.** Then it
    vanishes. There is no fade ramp, and the ttl is under one second. House
    rule 2 of `07_emoji_renderer.md` stays true: only `trail[0]` equals
    `blank`.
11. **A satellite is 🛸 on the emoji renderer.** The core still names the kind
    `"satellite"`. The core states what moves, and each renderer picks the
    picture. The backdrop star works the same way: `"star"` in the core, `*`
    in ascii, ⭐ in emoji. 🛰️ is not usable. It needs `U+FE0F`, and house rule
    1 forbids that.
12. **A 🌠 that moves right looks backwards.** The user accepted this. One
    cell, under one second, rare.
13. **Ascii does not use `kind`.** Its output does not change.
14. **Ascii and emoji share cell placement.** `placeMovers` in `adapters/cells.ts` puts
    each mover in its cell. Ascii and emoji each turn the mover into their own
    glyph. This is the same split as `contestCells`.
15. **Pixel movers draw in the sprite plane.** No third canvas exists. The
    background plane stays painted once. `paintFrame` draws the movers, and
    the browser shows the sky through every pixel that holds `blank`.
16. **Pixel movers merge with the fireworks as two index buffers.** `paintFrame`
    paints the movers into a buffer of their own. It paints the fireworks with
    the existing contest loop, which does not change. Then it merges them:
    a firework pixel wins unless it holds `blank`. A check for `blank` inside the
    contest loop would also skip a dead trail's brightness record, and that
    changes firework output. The merge is `overlayEmojiGrid` over index
    buffers.
17. **A pixel mover takes its colour from a brightness ramp.** `pixel.moverRamp`
    maps brightness to a palette index, as ascii maps it to a character. A
    pixel can dim, so the shooting star fades. `kind` does not pick the colour.
    `moverRamp[0]` equals `blank`, so a faded star leaves nothing behind. This is
    the rule of `trail[0]`.
18. **A shooting star has a tail on the pixel renderer.** `Mover` gets
    `velocity: Vec3`, in world units per second. The tail runs behind the head,
    against the velocity. Its length is `|velocity| × tailMs`, with `tailMs` per kind
    in `pixel.moverTailMs`. A satellite has `tailMs: 0`. The tail fades along its
    length to zero.
19. **A tail reaches behind the spawn point on its first frame.** `Mover` has
    no age, so the renderer cannot make the tail grow. The user accepted this.
    The tail is a few world units, and the time to live is under one second.
20. **The spawn range follows the renderer's width.** The pixel grid shows
    `x` within `±worldHalfWidth`, which is 88.75 on a 16:9 window. Ascii and
    emoji show ±50. Each entry of the `renderers` table in `main.ts` returns
    its half-width. `ambientForWidth` sets both x ranges of the ambient config
    to that width. The core gets data and does not read the window.
21. **Ascii and emoji do not use `velocity`.** Their output does not change.

## Why a mover is not a Sprite

`Frame.sprites` feeds `contestCells`. That function gives each cell to the
brightest sprite (`adapters/cells.ts`). A mover in `sprites` could take a
cell from a fading trail. `06_world_backdrop.md` gives the same reason for
the backdrop.

So `Frame` gets a second list, `ambient`. Each renderer that draws movers
composites it in its own pass.

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
  readonly kind: "shootingStar" | "satellite";
  readonly position: Vec3;
  readonly velocity: Vec3; // world units per second
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

/** The ambient config with both x ranges set to `[-halfWidth, halfWidth]`.
 * Every other field stays the same. */
export function ambientForWidth(
  config: AudioVisualConfig["ambient"],
  halfWidth: number,
): AudioVisualConfig["ambient"];
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

```ts
// src/audiovisual/adapters/cells.ts
/** The mover in each cell, or null. A mover outside the grid is not placed.
 * When two movers share a cell, the later one in the list wins. */
export function placeMovers(
  movers: readonly Mover[],
  grid: { readonly columns: number; readonly rows: number },
): readonly (Mover | null)[][];
```

```ts
// src/audiovisual/adapters/emojiGrid.ts
/** A grid of glyphs, the size of the firework grid. A mover becomes
 * `emoji.movers[kind]`. Every other cell is `emoji.blank`. Brightness is not
 * read. */
export function rasteriseEmojiAmbient(
  movers: readonly Mover[],
  emoji: AudioVisualConfig["emoji"],
): readonly string[][];
```

```ts
// src/audiovisual/adapters/pixelGrid.ts
// `paintFrame(frame, pixel)` keeps its signature and now draws
// `frame.ambient` behind the fireworks. It returns the merged buffer, the
// same size as before: `pixel.rows * pixel.columns` palette indices.
```

The order "later mover wins a shared cell" is a rule of `placeMovers`. A
brighter mover does not take priority. A shooting star and a satellite share
a cell for a frame or two at most, so a rule for the brighter mover adds cost
and no visible gain. Cycle 16 adds a test that states this order.

## Config

`AudioVisualConfig.ambient`. No code changes these values.

| Field                     | Default      | Meaning                               |
| ------------------------- | ------------ | ------------------------------------- |
| `ratePerSecond`           | `0.05`       | About 1 spawn in 20 seconds           |
| `cooldownMs`              | `8000`       | Wait between two movers of one kind   |
| `maxLive`                 | `2`          | Most movers alive at one time         |
| `shootingStar.x`          | `[-50, 50]`  | World x of the start                  |
| `shootingStar.y`          | `[65, 95]`   | World y of the start                  |
| `shootingStar.speed`      | `[40, 70]`   | World units per second                |
| `shootingStar.descent`    | `0.5`        | Vertical speed = −descent × speed     |
| `shootingStar.ttlMs`      | `[400, 800]` | Time to live                          |
| `shootingStar.brightness` | `1`          | Brightness at spawn. It fades to zero |
| `satellite.x`             | `[-50, 50]`  | The span it crosses                   |
| `satellite.y`             | `[80, 95]`   | World y of the whole path             |
| `satellite.speed`         | `[5, 9]`     | World units per second                |
| `satellite.brightness`    | `0.6`        | Constant                              |

A shooting star starts at an x drawn from `shootingStar.x`. Its direction is
left or right. A satellite starts at `satellite.x.min` or `satellite.x.max`.
It moves toward the other edge. Its ttl is the span divided by its speed. With
the default span of 100 units, the ttl is `100 / speed` seconds.

All start heights are above the highest ground point (14 units). Nothing
hides a mover behind the ridge.

`AudioVisualConfig.emoji` gets one more field:

| Field          | Default                                   | Meaning                       |
| -------------- | ----------------------------------------- | ----------------------------- |
| `emoji.movers` | `{ shootingStar: "🌠", satellite: "🛸" }` | The glyph for each mover kind |

Its type is `Readonly<Record<Mover["kind"], string>>`. A third kind with no
glyph fails `tsc`. The object is frozen with `Object.freeze`, as
`07_emoji_renderer.md` requires. Neither glyph contains `U+FE0F`, and neither
equals `emoji.blank`.

`AudioVisualConfig.pixel` gets two more fields:

| Field               | Default                               | Meaning                                    |
| ------------------- | ------------------------------------- | ------------------------------------------ |
| `pixel.moverRamp`   | `[0, 5, 6, 7]`                        | Palette index by brightness, dimmest first |
| `pixel.moverTailMs` | `{ shootingStar: 120, satellite: 0 }` | Tail length in milliseconds of travel      |

`moverRamp[0]` equals `pixel.blank`. The type of `moverTailMs` is
`Readonly<Record<Mover["kind"], number>>`, so a third kind with no tail length
fails `tsc`. Both are frozen with `Object.freeze`. The speed of a shooting
star includes its descent: with `descent` 0.5 and a config speed of 40 to 70,
`|velocity|` is 45 to 78 world units per second. Its tail is 5.4 to 9.4 world
units long, which is 8 to 15 pixels.

`main.ts` replaces the x ranges with `ambientForWidth`. On a 16:9 window the
pixel renderer spawns movers in `x` within ±88.75. A satellite then crosses
the whole screen. Its time to live is the span divided by its speed, so it is
longer on a wide window: on a 16:9 window the span is 177.5 units, so a
satellite lives 20 to 35 seconds, against 11 to 20 seconds on ascii and emoji.
It holds one of the `maxLive` slots for longer, so a new mover may find the
sky full a little more often on the pixel renderer.

## How the ascii renderer composites

`createAsciiRenderer` already holds `base`, the backdrop grid. Each frame it
makes the firework grid and joins the grids with `overlayGrid`:

```ts
overlayGrid(overlayGrid(base, ambientGrid), fireworkGrid);
```

`overlayGrid` keeps the foreground character unless it is a space. So a
mover replaces the sky. A firework replaces a mover.

`rasteriseAmbient` uses `placeMovers` for the position and `rampChar` for
the character. This keeps the rule "more ink means more light". A dim mover
is a faint character.

## How the emoji renderer composites

`createEmojiRenderer` already holds `base`, the backdrop glyph grid. Each frame
it makes the mover grid and the firework grid, then joins the three:

```ts
overlayEmojiGrid(overlayEmojiGrid(base, ambient, blank), fireworks, blank);
```

`overlayEmojiGrid` keeps the foreground glyph unless it is `blank`. So a mover
replaces the sky, and a firework replaces a mover. A trail at `trail[0]` is
`blank`, so a mover shows through a dead trail. Ascii does the same.

With no backdrop, `ambient` is the base. It has `blank` in every cell that
holds no mover, so the existing no-backdrop path stays the same.

`rasteriseEmojiAmbient` uses `placeMovers` for the position. It does not read
`brightness`. A star at brightness 0.05 draws the same 🌠 as one at 1. The
star vanishes when `createAmbient` removes it at the ttl.

## How the pixel renderer draws movers

The pixel renderer has two canvases. The background plane holds the sky. The
renderer paints it once. The renderer paints the sprite plane each frame, and
its `blank` pixels are transparent. So the movers must go in the sprite plane, behind the
fireworks. `paintFrame` does this with two buffers:

```
movers buffer   (all blank, then each mover)
fireworks buffer (the existing contest loop, no change)
out[i] = fireworks[i] !== blank ? fireworks[i] : movers[i]
```

A dead trail has brightness 0 and index `blank`. It still paints its centre
pixel. In the fireworks buffer that pixel is `blank`, so the merge keeps the
mover there.

**The head.** A mover paints one pixel at `toPixel(position)`. The index is
`rampLevel(brightness, moverRamp)`. A mover outside the grid paints nothing.
This code does not use `toCell` or `placeMovers`, because they fix the grid to
x ±50.

**The tail.** The tail is `|velocity| × moverTailMs[kind] / 1000` world units
long. It runs from the head back along the negative velocity. It has one sample
for each `100 / rows` world units. The brightness of a sample falls in a
straight line from the head's brightness to 0 at the far end. A sample paints
through `rampLevel`, and it never writes `blank`. The far samples paint first,
so the head wins. A later mover paints over an earlier one.

**A satellite moving left** starts at `x = +halfWidth`. That point is outside
the half-open box, so its first frame paints nothing.

## File layout

| Path                                                                        | Role                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------- |
| `docs/11_ambient_movers.md`                                                 | This plan, written before cycle 1                  |
| `src/audiovisual/types.ts`                                                  | Cycle 1 — `Mover`, `Frame.ambient`                 |
| `src/audiovisual/frame.ts`                                                  | Cycle 1 — `buildFrame` returns `ambient: []`       |
| the 8 test files that build a `Frame`                                       | Cycle 1 — add `ambient: []`                        |
| `src/audiovisual/adapters/asciiGrid.ts` and its test                        | Cycles 2–3 — `rasteriseAmbient`                    |
| `src/audiovisual/adapters/ascii.ts` and its test                            | Cycle 4 — composite                                |
| `src/audiovisual/config.ts`                                                 | Cycle 5 — `ambient` config                         |
| `src/audiovisual/ambient.ts` and `ambient.test.ts`                          | Cycles 5–11                                        |
| `src/audiovisual/audioVisualLayer.ts` and its test                          | Cycle 12 — `ambientRandom`                         |
| `src/main.ts`                                                               | Cycle 13 — seed and wiring                         |
| `docs/06_world_backdrop.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`       | Cycle 14 — doc sync                                |
| `src/audiovisual/types.ts`, `ambient.ts` and the tests that build a `Mover` | Cycle 15 — `Mover.kind`                            |
| `src/audiovisual/adapters/cells.ts`, `asciiGrid.ts` and their tests         | Cycle 16 — `placeMovers`                           |
| `src/audiovisual/adapters/emojiGrid.ts`, `config.ts` and the test           | Cycle 17 — `rasteriseEmojiAmbient`, `emoji.movers` |
| `src/audiovisual/adapters/emoji.ts` and its test                            | Cycle 18 — composite                               |
| `docs/11_ambient_movers.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`       | Cycle 19 — doc sync                                |
| `src/audiovisual/types.ts`, `ambient.ts` and the tests that build a `Mover` | Cycle 20 — `Mover.velocity`                        |
| `src/audiovisual/ambient.ts` and its test                                   | Cycle 21 — `ambientForWidth`                       |
| `src/audiovisual/adapters/pixelGrid.ts`, `config.ts` and the test           | Cycles 22–24 — head, merge, tail                   |
| `src/main.ts`                                                               | Cycle 25 — `renderers` returns `halfWidth`         |
| `docs/11_ambient_movers.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`       | Cycle 26 — doc sync                                |

## TDD build cycles

Test first, as in every plan before this one. Write the failing test. Watch
it fail for the right reason. Write the least code that makes it pass. Make
one commit per cycle.

Take expected values from the worked examples below. Never compute them with
the same formula as the code.

**How the cycles landed.** Two pairs of cycles share one commit each. Cycles 5
and 6 are one commit: a rate-0 test alone needs an unused parameter, which
`eslint` rejects. Cycles 12 and 13 are one commit: a required `ambientRandom`
option breaks the `main.ts` call at `tsc`, which the pre-commit hook runs on
the whole project. Cycle 3 passes on its first run, because `toCell` returns
`null` outside the grid and the type checker forces the guard in cycle 2.

Cycles 15 to 18 each have their own commit. Two tests there pass against a
rule that already held. In cycle 16, the test "the later mover wins a shared
cell" states what `rasteriseAmbient` already did. In cycle 18, the test "a
firework covers a mover" passes before the mover pass exists. It guards the
layer order, and a mutation that draws movers over fireworks fails it. Cycle 17
also adds a test for house rules 1 and 2 on the default glyphs, because
nothing else stops a glyph with `U+FE0F` from shearing the grid.

Cycles 20 to 26 each have their own commit. Four tests pass on their first
run, and a mutation shows that each can fail. In cycle 22, "paints nothing for
a mover outside the grid" guards the `toPixel` check before any mover paints.
In cycle 23, "lets a firework cover a mover" guards the merge order, and
"keeps a blank pixel blank when a dimmer spark follows a dead trail" guards
the contest loop against a `blank` skip. In cycle 24, "tailMs 0 draws the head
only" guards the per-kind lookup. The cycle 23 test "keeps the mover where a
dead trail sits" failed first, against the cycle 22 code that painted movers
into the firework buffer. Cycle 23 then moved them into a buffer of their own.
Cycle 22 also adds a test that the default `moverRamp` starts on `blank`,
because nothing else pins that house rule.

A cleanup after cycle 19 changed two things that cycle 1 and cycle 16 describe.
`buildFrame` now returns `Omit<Frame, "ambient">`, so no placeholder empty list
exists and the layer adds the movers. `contestCells` and `placeMovers` now share
one grid walk, `placeInCells`, and differ only in the rule for a shared cell.

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

**Before cycle 15:** the emoji renderer ignores `Frame.ambient`. `Mover` has no
`kind`. All tests pass. This section of the document exists.

15. **`createAmbient` gives each mover its kind.** Add `kind` to `Mover` in
    `types.ts`. `ambient.ts` derives its local `Kind` from `Mover["kind"]`.
    Red: a scripted star has `kind: "shootingStar"` and a scripted satellite
    has `kind: "satellite"`. This fails at run time. The contract change also
    forces three test edits, and none of them weakens a test: the `toEqual` in
    `audioVisualLayer.test.ts` gains `kind`, and the `mover()` helper in
    `asciiGrid.test.ts` and the literal in `ascii.test.ts` get a `kind`.
16. **`placeMovers` moves into `cells.ts`.** `rasteriseAmbient` calls it. This
    is a refactor, so every ascii test stays green. Add one test in
    `cells.test.ts`: when two movers share a cell, the later one wins. That
    test passes on its first run, because it states a rule that already holds.
    The commit message says so.
17. **`rasteriseEmojiAmbient` draws each kind's glyph.** Use override glyphs
    (`{ shootingStar: "A", satellite: "B" }`) on a small grid, so a fixed 🌠
    fails the test. A star at brightness 0.05 still draws its glyph. A mover
    outside the grid draws nothing. Every other cell is `blank`. Add
    `emoji.movers` to the config here, and freeze it.
18. **The emoji renderer composites in order.** Use the fake target from
    `emoji.test.ts` and write the expected grids by hand. A mover alone over
    the sky shows its glyph. A mover and a firework in one cell show the
    firework. With no backdrop, a mover shows on the blank grid.
19. **Doc sync.** Update `CLAUDE.md` Status, `README.md`, `CHANGELOG.md` and
    the "How the cycles landed" note in this document.

**Before cycle 20:** the pixel renderer ignores `Frame.ambient`. `Mover` has no
`velocity`. All tests pass. This section of the document exists.

20. **`createAmbient` gives each mover its velocity.** Add `velocity` to
    `Mover`. Red: a scripted star (the cycle 7 example) has
    `velocity { x: 25, y: -6.25, z: 0 }`, and a satellite moving right has
    `{ x: 10, y: 0, z: 0 }`. The contract change forces edits to every test
    that builds a `Mover`. None of them weakens a test.
21. **`ambientForWidth`.** Use a half-width of 88.75. Both x ranges become
    `[-88.75, 88.75]`. A field such as `cooldownMs` and the `y` ranges stay the
    same.
22. **`paintFrame` draws a mover head.** Use a small grid and an override
    `moverRamp`, so a fixed default fails. Brightness picks the index. A mover
    outside the grid paints nothing. The later mover wins a shared pixel. Add
    `pixel.moverRamp` to the config here, and freeze it.
23. **Fireworks cover movers.** A firework disc covers a mover pixel. A dead
    trail, with index `blank`, keeps the mover pixel. The contest loop has no
    change, so every existing `paintFrame` test stays green. Add a test that
    pins the order "dead trail first, dimmer spark second": the pixel stays
    `blank` in a frame with no mover.
24. **The tail.** Put the head at a pixel centre, so no hand-written sample
    falls on a `floor` boundary. A star that moves along x paints a tail that
    fades along its length, and the head wins. A diagonal star paints a
    diagonal tail. A `tailMs` of 0 paints the head only. Add `pixel.moverTailMs`
    to the config here, and freeze it.
25. **Wiring — UNTESTED.** Each `renderers` entry in `main.ts` returns
    `{ renderer, halfWidth }`. The layer gets
    `ambientForWidth(defaultAudioVisualConfig.ambient, halfWidth)` in its
    config.
26. **Doc sync.** Update `CLAUDE.md` Status, `README.md`, `CHANGELOG.md` and
    the "How the cycles landed" note in this document.

## Verification

Each cycle:

```bash
npx vitest run --reporter=agent --no-isolate --fsModuleCache src/audiovisual
```

Before each commit, all of these must pass: `npx vitest run`, `npx tsc`,
`npx eslint .`, `npx prettier --check .`, `npx knip`. The Husky hook runs most
of them.

This command prints one line only, the comment in `adapters/webAudio.ts`. No code in
`src/audiovisual/` calls any of the three:

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

The pixel renderer drew no movers when cycle 13 landed. Cycles 20 to 25 changed
that. The pixel checks below replace the check that held then.

Manual checks on the emoji renderer, after cycle 18:

1. Pick emoji in the Esc menu. Wait about 1 minute. 🌠 and 🛸 appear.
2. 🌠 vanishes in the middle of the sky. 🛸 crosses the full width.
3. The columns stay in line while a mover is on screen.
4. Press a key when a mover is in the sky. The firework covers the mover.
5. Pick ascii in the Esc menu. It looks the same as before.

Manual checks on the pixel renderer, after cycle 25:

1. Pick pixel in the Esc menu. Wait about 1 minute. A shooting star and a satellite
   appear.
2. A shooting star has a tail that fades, then it vanishes in the middle of the
   sky.
3. A satellite crosses from one screen edge to the other.
4. Press a key when a mover is in the sky. The firework covers the mover.
5. Pick ascii, then emoji. They look the same as before.

## Out of scope

- **A rate the user can change.** Add a table `{ off, rare, normal, busy }`
  that maps a name to a rate. Save the name as a setting and look it up with
  `selectRenderer`. Add a third radio group to the settings menu with `choicesFor`. `main.ts` then
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
- A different ascii character for each kind. Ascii keeps its brightness ramp.
- A tail on a shooting star in ascii or emoji, and any ascii or emoji drawing
  that is more than one cell.
- A pixel mover that is a disc, and a pixel colour for each kind.
- A tail that grows from the spawn point. `Mover` would need an age.

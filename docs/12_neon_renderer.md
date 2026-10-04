# Fireworks game — neon renderer build plan (v1)

See `05_audio_visual_layer.md` for the AudioVisual layer, `06_world_backdrop.md`
for the static sky, `09_8bit_renderer.md` for the pixel renderer this one is
modelled on, and `11_ambient_movers.md` for the movers. Those documents stay
closed as their own v1 records. In this one, the cycle count starts at 1.

The page URL no longer picks a renderer. The settings menu form saves the `renderer` setting, as
`13_settings_overrides.md` describes.

## Context

The project has three renderers: ascii, emoji and pixel. All three are calm.
This plan adds a fourth, `neon`, with an intense, oversaturated, neo-retro
look. It is "Mix 4 · Neon Ridge" from the design board:

- A black sky with cyan cross stars.
- A glowing cyan ridge.
- Sparks drawn as streaks along their motion.
- Additive blend and a soft bloom.
- Display P3 colour.

The renderer needs one change to the AudioVisual contract: `Sprite.velocity`.
It needs no clock and no cues.

**Out of scope here:** the grid floor, the sun, the banded sky, the palette
snap, pulse, flash and shake (other mixes on the board). `Frame.elapsedMs` and
`Frame.cues`. WebGL2. A resize handler. P3 detection. A lint rule for the
`src/audiovisual/` invariants.

## Decisions

The user made these decisions before anyone wrote this plan.

1. **`Sprite.velocity` is required.** It is a `Vec3` in world units per
   second.
   - A shell: `firework.velocity`.
   - A spark and a spark trail: `firework.velocity` plus `sparkVelocity` at
     the time of that sprite.
   - A shell trail: zero. A recorded trail point does not move.
2. **Three parts.** A pure scene builder turns data into plain values. A
   player replays those values onto a small `Canvas2DLike` port. `main.ts`
   makes the canvases. A recording fake tests the player.
3. **Stars do not bloom.** Stars go on the backdrop canvas, which is painted
   once.
4. **The canvases match the screen.** Each is `innerWidth × devicePixelRatio`
   by `innerHeight × devicePixelRatio`. `main.ts` reads both once at load.
5. **The moon and the planet are cyan outline rings** on the backdrop canvas.
6. **Movers draw in the light canvas** with the same streak rule, so they
   bloom.
7. **One rule covers every sprite.** Velocity not zero gives a streak.
   Velocity zero gives a disc. A shell is a streak plus a near-white core
   disc.
8. **The registry key is `neon`.** It is the value of the `renderer` setting.
9. **`Rgb` floats are read as Display P3.** They go straight into
   `color(display-p3 r g b / a)`. Pure red becomes P3 red.
10. **The renderer always writes P3 strings.** On an sRGB canvas the browser
    maps them. There is no detection code.
11. **Spark trails streak too.** Each spark becomes one fading tail of about
    200 ms.
12. **The size is read at load only**, the same as pixel.

## Why the velocity of a spark includes the shell

`expandBurst` passes the live `firework.position` as the origin of each spark.
Action keeps stepping that position through `exploding`. The drawn spark
therefore moves at `firework.velocity` plus the derivative of `sparkPosition`.
A streak built from the derivative alone points the wrong way, and the error
grows as the shell falls.

## Why the ridge is sampled across the screen

`Backdrop.ground` covers x from −50 to 50. The screen covers ±`50·W/H`, about
±89 at 16:9. `groundHeightAt` holds the end heights flat outside ±50, so the
ridge needs a point at each screen edge.

## Why bloom uses shrunk copies

`ctx.filter` is missing in Safari up to 26.0 (caniuse). `shadowBlur` is slow
for each shape. The bloom copies the light canvas to a 1/4 canvas and a 1/8
canvas, then draws both back on top at full size. The scale-up blurs them.

## Key contracts

```ts
// types.ts
interface Sprite {
  /* …existing fields… */
  readonly velocity: Vec3; // world units per second
}

// sparks.ts
function sparkVelocity(
  direction: Vec3,
  speed: number,
  gravity: Vec3,
  drag: number,
  t: number,
): Vec3;

// neonScene.ts: plain values, in canvas pixels
interface Streak {
  from: Point;
  to: Point;
  width: number;
  color: Rgb;
  alpha: number;
}
interface Disc {
  centre: Point;
  radius: number;
  color: Rgb;
  alpha: number;
}
interface NeonLight {
  streaks: Streak[];
  discs: Disc[];
}
interface NeonBackdrop {
  ridge: Point[];
  stars: Cross[];
  rings: Ring[];
}

// neon.ts: the port
interface Canvas2DLike<Source> extends Pick<
  CanvasRenderingContext2D,
  "globalAlpha" | "fillStyle" | /* … */ "stroke"
> {
  drawImage(
    source: Source,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void;
}
interface NeonSurface<Source> {
  context: Canvas2DLike<Source>;
  source: Source;
  width: number;
  height: number;
}

// neon.ts: the options of the player
createNeonRenderer({ light, background, quarter, eighth, backdrop, config });
```

No port member is named `getContext`. The port is picked from
`CanvasRenderingContext2D`, so a real context is assignable to it by
construction, and `tsc` checks this in `main.ts`. A hand-written port failed
this check: the real `globalCompositeOperation` and `fillStyle` types are
wider than the literals the first draft used. Only `drawImage` is the port's
own, because it takes the `Source` of the surface.

`neonBackdrop(backdrop, config, canvas)` takes the config as its second
argument, for `starArm` and `bodies`.

## The port, and its fake

`src/audiovisual/` calls no DOM function. The player receives surfaces from
`main.ts`. The test fake records each call and each property write in order.
It uses an opaque token as the `Source` of `drawImage`, so no test needs a
canvas.

## Config

The `neon` block of `AudioVisualConfig`. The defaults come from the board.

- `streakMs`: the length of a streak, in ms of motion (45).
- `shellCore`: `{ scale, color }`, a near-white core disc.
- `starArm`: the cross arm length in world units. `starColor`: P3
  `(0.51, 1, 1)`.
- `starWidth`, `ringColor`, `ringWidth` and `bodies` (the ring radii: moon 6,
  planet 2.5). All widths are world units, scaled by `height / 100`.
- `ridgeColor` (cyan), `ridgeWidth`, `groundFill` (near-black).
- `moverColor`, `moverSize` (a mover has no size of its own) and
  `moverTailMs` (`{ shootingStar: 120, satellite: 0 }`).
- `bloom`: `{ quarterAlpha: 0.85, eighthAlpha: 1 }`.

The bloom divisors, 4 and 8, are constants in `main.ts`, not config. They are
tied to the names `quarter` and `eighth`.

`starWidth` and `moverSize` were not in the first plan. The first build needs
both.

## File layout

| File                                          | Change                                                    |
| --------------------------------------------- | --------------------------------------------------------- |
| `src/audiovisual/types.ts`                    | Add `Sprite.velocity`                                     |
| `src/audiovisual/sparks.ts`                   | Add `sparkVelocity`. `expandBurst` sets the velocity.     |
| `src/audiovisual/frame.ts`                    | Shell and shell trail velocity                            |
| `src/audiovisual/config.ts`                   | Add the `neon` block                                      |
| `src/audiovisual/adapters/neonScene.ts` (new) | Pure: `toCanvas`, `neonFrame`, `neonBackdrop`             |
| `src/audiovisual/adapters/neon.ts` (new)      | `Canvas2DLike`, `NeonSurface`, `p3`, `createNeonRenderer` |
| `src/main.ts`                                 | Add the `neon` factory to `renderers`                     |
| `index.html`                                  | Add `canvas.neon` CSS                                     |
| `CLAUDE.md`, `README.md`, `CHANGELOG.md`      | Doc sync                                                  |

## TDD build cycles

Rules for every cycle:

- Write one failing test. Watch it fail for the right reason. Write the least
  code that passes.
- Make one commit per cycle.
- Run `npm run test:run`, `npx tsc`, `npx eslint .`, `npx prettier --check .`
  and `npx knip`. All must be clean.
- Use unusual config values and canvas sizes, so a hard-coded value fails.

### Pass A: the contract

1. **`sparkVelocity` in `sparks.ts`.** For direction (1,0,0), speed 10,
   gravity (0,−18,0) and t 1000 ms: with `drag = 0` the velocity is
   (10, −18, 0). With `drag = 0.5` it is about (6.0653, −14.165, 0). Both are
   worked by hand from the formula.
2. **`Sprite.velocity` and every sprite source.**
   - A shell has `firework.velocity`.
   - A shell trail has zero.
   - A spark: call `expandBurst` at times t and t+δ, with `firework.position`
     advanced by `firework.velocity·δ`. The change in position over δ matches
     the reported velocity.
   - A spark trail at step k has the velocity at `t − k·trailSpacingMs`.
   - The two untyped `toEqual` values in `frame.test.ts` gain the expected
     velocity. This adds an expected value for a new field. It does not weaken
     a test.

### Pass B: the pure scene (`neonScene.ts`)

3. **`toCanvas`.** On a 300×120 canvas, world (−halfWidth, 100) maps to
   (0, 0) and (halfWidth, 0) maps to (300, 120). The scale is `height/100`
   pixels per world unit.
4. **A spark becomes a streak.** It runs from `position − velocity·streakMs/1000`
   to `position`. Width is `2·size·scale`. Alpha is `brightness`.
5. **Zero velocity becomes a disc.** A shell trail gives a disc of radius
   `size·scale` and no streak.
6. **A shell is a streak plus a core disc.**
7. **Movers.** A shooting star gives a streak of `speed·moverTailMs.shootingStar`.
   A satellite (tail 0) gives a disc.
8. **The ridge.** On a 400×100 canvas the first point is at x = 0 and the
   last at x = 400. The heights come from `groundHeightAt`.
9. **Stars and rings.** One cross per star. One ring each for the moon and the
   planet, with the configured radii.

### Pass C: the player (`neon.ts`)

10. **`p3`.** `p3({r:1,g:0.5,b:0}, 0.25)` gives `color(display-p3 1 0.5 0 / 0.25)`.
11. **The backdrop surface is painted once**, at construction. Two frames
    later the backdrop recording has not grown.
12. **The light surface each frame.** The order is `clearRect`,
    `globalCompositeOperation = "lighter"`, the ridge stroke, the streaks and
    the discs.
13. **Bloom.** Copy the light surface to the quarter surface, then the quarter
    to the eighth. Draw the quarter, then the eighth, onto the light surface at
    full size. Reset `globalAlpha` and the composite mode.

### Pass D: onto the screen

14. **The `neon` factory in `main.ts`. UNTESTED.** Same trade-off as pixel
    cycle 18. `tsc` checks that a real context fits the port.
15. **CSS in `index.html`. UNTESTED.** `canvas.neon` is fixed and fills the
    viewport. It has no `image-rendering: pixelated`, because neon lines are
    smooth.
16. **Doc sync.** `CLAUDE.md`, `README.md`, `CHANGELOG.md`.

## Verification

```bash
npm run test:run && npx tsc && npx eslint . && npx prettier --check . && npx knip && npm run build
grep -rE "Math.random|Date.now|performance.now|location|innerWidth|devicePixelRatio" src/audiovisual/
grep -rn "ImageData\|getContext\|document\." src/audiovisual/
```

The first grep finds only the known comment in `webAudio.ts`. The second finds
nothing.

Manual checks with `npm run dev`:

- Chrome and Safari, with neon picked in the Esc menu and applied:
  - The sky is black with cyan crosses. The moon and the planet are cyan rings.
  - The ridge glows from edge to edge.
  - Sparks are fading streaks that point along their motion, also after the
    shell drifts.
  - Overlaps go white-hot. Shooting stars streak. Satellites are dots.
- The Esc menu lists `neon`, and Apply switches to it.
- Firefox: unchecked. Firefox has no canvas `colorSpace` (caniuse). Whether it
  accepts `color(display-p3 …)` as a canvas colour is not verified. Record the
  result here.
- A window resize stretches the picture until reload. This is expected.
- The ascii, emoji and pixel renderers still work.

## Out of scope

- The grid floor, the sun, the banded sky, the palette snap, pulse, flash and
  shake.
- `Frame.elapsedMs` and `Frame.cues`.
- WebGL2.
- A resize handler.
- P3 detection or an sRGB string fallback.
- A lint rule for the `src/audiovisual/` invariants.

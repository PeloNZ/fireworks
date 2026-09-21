# Fireworks game — world backdrop build plan (v1)

See `01_intent.md` for the overall vision and `05_audio_visual_layer.md` for the AudioVisual layer this
plan extends. That layer's v1 scope is closed: fireworks launch, fly, burst into sparks, trail, and make
sound. This document is the _how_ for what they perform against — a sky.

This document assumes no background in rendering. Where a decision needs a concept explained — a
gradient, a height field, a compositing order — the explanation is here in full, not linked out.

**Out of scope here**: colour, motion, and any renderer beyond ASCII. This plan draws a static sky
gradient, static stars, a moon and a planet, and a static ground silhouette, all from one seed generated
fresh on each page load — nothing more.

## Why the game needs a backdrop at all

Every cell a firework does not occupy is a space. The display is therefore mostly nothing, and the
fireworks read as dots on a void rather than fireworks in a sky. `00_discovery.json` recorded the
intended fix before any layer existed:

> "I'd keep the ground/skyline simple — dark gradient sky, a silhouette horizon — so the fireworks stay
> the whole show."

That sentence sets both halves of the brief. A backdrop, yes — but a **quiet** one. Every decision below
that looks cautious (the dim cap, the paint order, the compositing rule) is that sentence's second
clause doing its work: the fireworks stay the whole show.

## Why the backdrop is not a `Frame`, and why that is the load-bearing decision

The obvious way to add a sky is to emit backdrop sprites into `frame.sprites` and let the existing
renderer draw them. That is a latent bug, and reading `rasteriseFrame` shows exactly why.

`rasteriseFrame` resolves two sprites landing in one cell by **brightest wins** — see "Draw order and
'brightest wins'" in `05_audio_visual_layer.md`. It does so by recording each sprite's brightness in a
map of cells, and it records that brightness **even when the sprite renders as a space**. With the
default ten-character ramp, any brightness below `0.5/9 ≈ 0.056` maps to `ramp[0]`, which is a space. So
a sprite can occupy a cell, draw nothing visible, and still hold the cell against everything dimmer.
Worse, the tie-break is `>=`, so on equal brightness the sprite that arrived **first** keeps the cell.

A dim sky emitted as sprites would therefore cover all 3200 cells, appear to draw nothing, and silently
swallow the faintest tails of every decaying trail. Brightest-wins is a stand-in for blending. It is not
a layering system, and a backdrop is precisely a layering problem.

So the backdrop is **a separate value, composited underneath the finished foreground**. The foreground
wins a cell unless it is blank there. Two consequences fall out of that, both wanted:

- **The backdrop can never suppress a firework.** Not by convention, but by construction: a `Backdrop`
  is not assignable to a `Sprite`, so it cannot enter the brightness map at all. The compiler enforces
  the rule.
- **`Sprite.kind` stays closed** at `"shell" | "spark" | "trail"`. No existing assertion that filters or
  counts sprite kinds changes meaning.

The backdrop is also **static**, so it rasterises **once**, when the renderer is constructed — not sixty
times a second for something that never changes. Motion later is a rebuild of that one base grid on some
cadence, not a redesign.

## Where each piece lives

`05_audio_visual_layer.md` settles this with one question: _does anything other than a renderer read
this value to make a decision?_ Nothing reads the moon's position or a hill's height to decide anything,
so none of this belongs in Action. And two renderers looking at the same seed must show the **same** sky,
which is the same argument that put sparks in the core rather than in an adapter — if each renderer
placed its own stars, an ASCII grid and a future Canvas would disagree about the sky.

So the split is the one this layer already uses, one level down:

- **The core** (`backdrop.ts`) decides **what and where**, in world space: how bright the sky is at a
  given height, where each body sits, how high the ground reaches at a given `x`. Pure, seeded, tested.
- **The ASCII adapter** (`adapters/asciiBackdrop.ts`) decides **which character**: a glyph per body kind,
  a ramp character per brightness, rows and columns. A future Canvas adapter reads the same `Backdrop`
  and draws discs and a filled polygon, reusing every placement decision without touching it.

A house rule that keeps the split honest, worth stating because it is checkable: **`backdrop.ts` must
never name a character.** A glyph is a rendering decision; if one appears in the core, the core has
started rendering. `config.ts` does hold the default glyphs, which is not a violation — declaring a
tunable is not deciding how to draw, and decision 6 below explains why they live in config rather than
inside the adapter.

## Decisions

1. **One seed per page load, not persisted.** No URL parameter, no storage, nothing surfaced. A refresh
   is a new sky, which is the whole interaction: refresh until you get one you like. Deliberately
   accepted consequence — a sky you liked is gone when you reload. Making one keepable is a URL-hash
   feature this plan does not build.
2. **The sky is capped dim.** No sky brightness ever exceeds `backdrop.skyMaxBrightness` (0.25). This is
   the "fireworks stay the whole show" clause expressed as a number, and it is enforced in the core, not
   the adapter, so a future Canvas sky is dim for the same reason without having to remember to be.
3. **Bodies are fixed glyphs per kind**: a star is `*`, a moon `O`, a planet `o`. A body is a thing, and
   a thing should read as itself rather than as a brightness level. This is the one place this plan
   departs from the ramp, and the general rule it implies is worth writing down: **discrete objects get a
   glyph; continuous fields get the ramp.** Bodies are objects. The sky gradient and the ground mass are
   fields.
4. **The ground is a ridge plus a filled mass.** The topmost ground cell in each column gets a fixed
   ridge glyph (`^`); every cell below it is filled at `backdrop.groundFillBrightness` through the ramp.
   Per decision 3's rule: the skyline is a discrete line, the mass beneath it is a field.
5. **A brighter sunset washes out the stars.** Star count falls as the sky's horizon brightness rises, so
   a near-black night is full of stars and a lit horizon shows only a few. Each sky is then coherent
   rather than randomly assembled. Note what this cannot mean here: with fixed glyphs (decision 3) a star
   has no brightness to dim, so "washed out" is expressible only as **fewer**, not fainter. How much is
   washed away is the `STAR_WASHOUT` constant in `backdrop.ts` — at `0.8`, the brightest sky the cap
   allows still keeps a fifth of its stars, so a sunset thins the field rather than emptying it. A module
   constant rather than a config field, the same standing `sparks.ts` gives its pattern-shaping
   constants: the tests assert the invariant (fewer under a lit sky) rather than a pinned count, so a
   config field would buy nothing.
6. **Glyphs live in config, not in module constants.** Only so a test can drive unusual glyphs and a
   hardcoded `"O"` fails — the project's standing rule that an assertion must defeat a shortcut.
7. **Its own document.** `05_audio_visual_layer.md` stays closed as the v1 record; this file's cycles
   start again at 1.

## The concepts, explained

### A gradient, in a monochrome grid

A **gradient** is a value that varies smoothly across space instead of changing in steps. A sky gradient
is brightness as a function of height: brightest near the horizon, darkening as you look up.

Two ends are enough to express it. `SkyGradient` holds a brightness at world `y = 0` (`horizon`) and one
at `y = 100` (`zenith`), and any height in between is the straight line between them —
`skyBrightnessAt`. This is the same **linear interpolation** `lerpVec3` already does for a shell's
position between two physics steps, applied to one number instead of three.

Two ends, rather than a list of stops, because two ends already span the whole brief. `horizon` near zero
is a solid black night. `horizon` at the cap with a dark `zenith` is a dim sunset. A third stop would buy
a warm band under a deep zenith, which is a colour idea, and colour is out of scope. A list is an
additive change later.

`zenith` is always less than or equal to `horizon`, and that is structural rather than asserted-and-hoped:
`horizon` is drawn first, and `zenith` is drawn as a fraction **of** `horizon`. A sky cannot come out
brighter overhead than at the horizon, because there is no expression in the generator that could produce
one.

**Expect banding, and expect it to look right.** With the cap at 0.25 and the default ten-character ramp,
`Math.round(0.25 * 9)` is 2, so the sky can only ever reach the third character of the ramp. Three levels
across forty rows means the gradient reads as two or three broad horizontal bands, not a smooth fade.
For a night sky that is the correct look — mostly empty, with a suggestion of glow low down. It is stated
here so it is a deliberate consequence at cycle 8 rather than a surprise. Both knobs are config:
`skyMaxBrightness` and the length of `ascii.ramp`.

### A height field, and why the ground is not a picture

The ground could be stored as "which cells are ground", but that would bake the grid's resolution into
the data, and an 80-column grid and a 1920-pixel canvas would then trace different hills from the same
seed — the failure decision "where each piece lives" exists to prevent.

Instead the ground is a **height field**: a short list of `GroundPoint`s, each saying "at this world `x`,
the ground reaches this world `y`". `groundHeightAt` answers the question for any `x` in between by
interpolating between the two points that bracket it. The points are the data; the resolution is the
renderer's business. An ASCII adapter samples it once per column; a Canvas adapter would sample it per
pixel, or stroke the points directly as a path.

The points span the full world width, `x = -50` to `x = 50` **inclusive**. That looks like it contradicts
the half-open render box described below, and it does not: these are not positions to be drawn, they are
control points to be sampled. A polyline that stopped short of `x = 50` would leave the rightmost columns
extrapolating off the end of the data.

### Compositing, and the one rule that makes it safe

**Compositing** is combining two finished images into one. Here there are exactly two layers and one
rule:

> The foreground shows through unless it is blank. A foreground cell holding a space reveals the
> backdrop.

`overlayGrid(base, over)` walks the two grid strings in step and takes the foreground character unless it
is a space. That is legitimate rather than a shortcut, and the reason matters: **a foreground cell that
renders as a space is already visually nothing.** A sprite too dim to draw and an empty cell are
indistinguishable on screen today. Letting the sky show through either one changes no visible output.

Getting this rule backwards would be a real artifact. If a too-dim sprite instead **erased** the backdrop,
a decaying trail tail would punch a moving black hole through the sky — something meant to be invisible
becoming visible by subtraction.

One invariant this rule depends on, already true and now load-bearing: **`ascii.ramp[0]` must be a
space.** It is what "blank" means.

Inside the backdrop itself there is no brightness contest at all — just a **paint order**, declared on
the `Backdrop` type and applied in that order: sky, then bodies, then ground. Later simply wins. That
single decision buys two behaviours free, with no overlap detection and no rejection sampling:

- a star drawn at the moon's position loses to the moon, because the moon is later in `bodies`;
- a star below the skyline is buried by the ground, because ground paints last.

### The half-open render box

`rasteriseFrame` maps a world point to a cell with `column = floor(((x + 50) / 100) * columns)` and
`row = rows - 1 - floor((y / 100) * rows)`, then discards anything outside `[0, columns)` or
`[0, rows)`. So `x = 50` exactly maps to `column === columns` and `y = 100` exactly maps to `row === -1`,
and both are clipped. Renderable world space is **`x ∈ [-50, 50)` and `y ∈ [0, 100)`** — half-open at the
top and right.

This plan satisfies that by the **range of the generator**, not by a clamp, which is worth knowing because
a reader will look for the clamp and not find one. `createRandom` returns values in `[0, 1)`, so
`x = -50 + r * 100` is exactly `[-50, 50)` and `y = min + r * (100 - min)` is exactly `[min, 100)` —
neither can produce the one coordinate that would vanish. Change either expression to include its
endpoint and the moon disappears roughly one load in four billion, which is the worst kind of bug to own.

The backdrop's sky and ground do not go through that mapping at all. They are rasterised in **cell
space**: the adapter walks every row and column and asks the core what the world looks like at that
cell's centre. That is a deliberate asymmetry with sprites, and it is the right one — a backdrop must
cover the whole rectangle, including the top row, which a sprite at `y = 100` cannot reach.

A cell's centre in world space is the inverse of the mapping above:

```
rowCentreY(row)       = 100 * (rows - row - 0.5) / rows
columnCentreX(column) = 100 * (column + 0.5) / columns - 50
```

Sampling centres rather than edges means the drawn skyline is the true height rounded to the nearest
cell, with no systematic bias up or down.

## Key contracts

```ts
/** The sky's brightness at the two ends of world space, already capped to
 * `backdrop.skyMaxBrightness`. `zenith <= horizon` always: a sunset glows
 * low and darkens overhead, and a black night is both ends near zero. */
interface SkyGradient {
  readonly horizon: number; // 0..1, at world y = 0
  readonly zenith: number; // 0..1, at world y = 100
} // cycle 1

/** One static object in the sky. `kind` is all a renderer needs to choose
 * a look: a glyph here, a disc in a future Canvas adapter. No brightness
 * field — a fixed glyph has no brightness to vary, and no field lands
 * before a test can drive it. */
interface CelestialBody {
  readonly kind: "star" | "moon" | "planet";
  readonly position: Vec3; // z always 0, same as every sprite
} // cycle 3

/** One sample of the skyline: at world `x`, the ground reaches `height`.
 * Sample it with `groundHeightAt`, never by indexing — the interpolation
 * rule belongs to the core, not to a renderer. */
interface GroundPoint {
  readonly x: number; // world units, -50..50 inclusive
  readonly height: number; // world y of the ridge at this x
} // cycle 5

/** Everything behind the fireworks, built once per page load and never
 * changed. Painted bottom to top in field order: sky, then bodies, then
 * ground. `bodies` is itself in paint order — later entries draw over
 * earlier ones, which is what makes the moon beat a star sharing its cell
 * without any overlap test. */
interface Backdrop {
  readonly sky: SkyGradient;
  readonly bodies: readonly CelestialBody[];
  readonly ground: readonly GroundPoint[];
} // cycle 7
```

The core's functions, all pure:

```ts
// backdrop.ts
function skyBrightnessAt(sky: SkyGradient, y: number): number;
function groundHeightAt(ground: readonly GroundPoint[], x: number): number;
function buildSky(
  seed: number,
  config: AudioVisualConfig["backdrop"],
): SkyGradient;
function buildBodies(
  seed: number,
  config: AudioVisualConfig["backdrop"],
  sky: SkyGradient, // decision 5: a brighter horizon means fewer stars
): readonly CelestialBody[];
function buildGround(
  seed: number,
  config: AudioVisualConfig["backdrop"],
): readonly GroundPoint[];
function buildBackdrop(
  seed: number,
  config: AudioVisualConfig["backdrop"],
): Backdrop;
```

`build*` rather than `create*`: this project reserves `create*` for factories that return behaviour
(`createWorld`, `createTrails`, `createRandom`) and `build*` for functions that return plain data
(`buildFrame`, `buildFireworkSpec`). A backdrop is data.

The adapter's, also pure:

```ts
// adapters/asciiBackdrop.ts
function rasteriseBackdrop(
  backdrop: Backdrop,
  config: AudioVisualConfig,
): string;
function overlayGrid(base: string, over: string): string;
```

`rasteriseBackdrop` takes the whole config, unlike `rasteriseFrame` which takes only the `ascii` slice,
because it needs two slices: `ascii` for the grid and its characters, and `backdrop` for the ground's
fill brightness. That brightness is a fixed tunable rather than anything a seed decides, so it stays in
config instead of riding on the `Backdrop` value — a `Backdrop` holds only what one seed produced.

And the one changed signature in the whole plan:

```ts
// adapters/ascii.ts
function createAsciiRenderer(options: {
  readonly target: TextTarget;
  readonly config: AudioVisualConfig;
  readonly backdrop: Backdrop | null; // null = no sky behind the fireworks
}): Renderer;
```

`Backdrop | null`, required, rather than an optional property — `exactOptionalPropertyTypes` is on, and
this layer already states absence that way in `Voice.filter` and `Voice.frequencyEndHz`. Requiring it
makes "is there a sky here?" an explicit decision at every call site, so `main.ts` cannot quietly lose it.

**`rasteriseFrame`'s signature and behaviour are unchanged**, so all four of its full-grid tests stay
green with their assertions untouched. Compositing happens above it:

```ts
const base = backdrop === null ? null : rasteriseBackdrop(backdrop, config);
return (frame) => {
  const grid = rasteriseFrame(frame, config.ascii);
  target.textContent = base === null ? grid : overlayGrid(base, grid);
};
```

`base` is computed outside the returned closure. That placement is what "rasterised once" means, and it
is a code shape a reviewer checks rather than a behaviour a test asserts — inventing an injection seam
purely to count calls would add a concept for a test's sake.

Two things in `asciiGrid.ts` are shared rather than copied, both for the same reason — a second copy of a
rule that must agree between the two rasterisers can drift, and a backdrop misaligned from the fireworks
by one cell would be a hard bug to see:

- **`rampChar` is exported**, so the sky and the ground mass use the one brightness-to-character mapping.
- **The world-to-cell mapping is extracted as `toCell`**, in `adapters/cells.ts`, alongside `rowCentreY`
  and `columnCentreX` — shared by both rasterisers, and by the emoji renderer's own adapters; see "The
  shared seam: `contestCells`" in `docs/07_emoji_renderer.md`. `toCell` returns an inline object type
  rather than a named `Cell` interface, because a type nothing else imports is dead code `knip` flags.

## Seeding

`src/main.ts` is the only place in this project that reads real nondeterminism, and it already does so
for the control layer's clock. It generates the page-load seed and builds the backdrop once:

```ts
const backdropSeed = hashString(
  `${Date.now().toString()}:${Math.random().toString()}`,
);
const backdrop = buildBackdrop(backdropSeed, defaultAudioVisualConfig.backdrop);
```

`Date.now()` alone would be nearly identical between two quick reloads; `Math.random()` supplies the
entropy and `hashString` folds the pair into the uint32 `createRandom` expects. Both calls stay in
`main.ts` — `grep -rE "Math.random|Date.now|performance.now" src/audiovisual/` must keep returning
nothing.

`buildBackdrop` then derives **one independent stream per concern**, following the convention
`src/action/spec.ts` documents in full:

```ts
const sky = buildSky(hashString(`${seed.toString()}:sky`), config);
const bodies = buildBodies(
  hashString(`${seed.toString()}:bodies`),
  config,
  sky,
);
const ground = buildGround(hashString(`${seed.toString()}:ground`), config);
```

Not `createRandom(seed)` three times. That would restart the same sequence three times and draw the same
first fraction for the sky's horizon, the first star's `x`, and the first hill's height — correlating
three values that must vary independently. Hashing a distinguishing suffix gives each concern its own
stream.

One harmless surprise to know about while tuning: every body draws from the single `:bodies` stream, so
changing `starCount` changes how many draws precede the planet and the moon, and moves them. Nothing
correlates with anything it shouldn't — which is what the convention actually guards — but a moon that
jumps when you edit a star count is confusing if you are not expecting it.

## Config

Split by who reads it: **would a future Canvas renderer need this value? Yes, top level. No, under
`ascii`.** The generator's world-space numbers are every renderer's business; characters are one
adapter's.

```ts
interface AudioVisualConfig {
  // ... existing fields
  readonly backdrop: {
    // The dim cap from decision 2. No sky brightness ever exceeds it, so
    // the fireworks always read over the sky. With the default 10-character
    // ramp, 0.25 keeps every sky cell at or below the ramp's third
    // character.
    readonly skyMaxBrightness: number; // 0.25
    readonly starCount: NumberRange; // { min: 18, max: 40 }, before washout
    // World y floor for every body. Keep this above groundHeight.max, or a
    // body generates inside the landform and the ground paints over it —
    // wasted scenery rather than a bug, since ground paints last.
    readonly celestialMinHeight: number; // 35
    readonly groundPoints: number; // 9 — skyline control points; must be >= 2
    readonly groundHeight: NumberRange; // { min: 5, max: 14 }
    // Ramp level for the mass below the ridge. Must exceed the sky's own
    // cap above, or the ground lands on the same ramp character as the
    // horizon it meets and the landform becomes invisible.
    readonly groundFillBrightness: number; // 0.4
  };
  readonly ascii: {
    readonly columns: number;
    readonly rows: number;
    readonly ramp: string;
    // Fixed per kind, by decision 3 — an object should read as itself, not
    // as a brightness. In config rather than as module constants only so a
    // test can drive unusual glyphs and a hardcoded "O" fails.
    readonly backdropGlyphs: {
      readonly star: string; // "*"
      readonly moon: string; // "O"
      readonly planet: string; // "o"
      readonly ridge: string; // "^"
    };
  };
}
```

Hand-frozen with `Object.freeze` at every level, including both nested `NumberRange`s and
`backdropGlyphs` — there is no `deepFreeze` helper in this project and a missed level is invisible at
runtime.

`NumberRange` is imported from `src/action/config.ts`, the same type the rest of this config uses.

## File layout

```
src/audiovisual/
  backdrop.ts          skyBrightnessAt, groundHeightAt, buildSky,
                       buildBodies, buildGround, buildBackdrop       [pure]
  types.ts             + SkyGradient, CelestialBody, GroundPoint,
                         Backdrop  — one cycle at a time
  config.ts            + backdrop key, ascii.backdropGlyphs
  adapters/
    cells.ts           toCell, rowCentreY, columnCentreX             [pure]
    asciiBackdrop.ts   rasteriseBackdrop(backdrop, config),
                       overlayGrid(base, over)                       [pure]
    asciiGrid.ts       rampChar exported; rasteriseFrame's behaviour
                       unchanged
    ascii.ts           createAsciiRenderer({ target, config, backdrop })
src/main.ts            + page-load seed, buildBackdrop, backdrop passed in
index.html             + one <style> block — see "The white page"
```

`asciiBackdrop.ts` is split from `asciiGrid.ts` for the same reason `asciiGrid.ts` was split from
`ascii.ts`: the interesting part is a pure function returning a plain string that a test can assert in
full, and the two rasterisers have no code in common beyond `rampChar`.

## The white page

**There is no CSS anywhere in this project** — no stylesheet, no `<style>` block, no inline styles. The
grid therefore renders with browser defaults: **dark text on a white background.**

That inverts the entire model. The brightness ramp assumes more ink means more light, so on white paper a
dim sky becomes grey smudges, the brightest firework is the darkest thing on screen, and the moon is a
dark `O` in a bright void. "Solid black to a sunset" cannot be shown on a white page at all.

Cycle 14 adds one `<style>` block to `index.html`: a dark `body` background, a light monospace colour,
and **`line-height: 1` on the `<pre>`**. The line height matters as much as the colour — at a default
leading of roughly 1.2, forty rows of characters have visible horizontal gaps between them, so a filled
sky reads as a dotted field rather than a continuous one. Zero test impact; its own commit, so it can be
reverted independently of the feature.

## TDD build cycles

Test-driven, same discipline as every layer before it: write the failing test first, then the minimum
code to pass, one commit per cycle. Every cycle drives its assertion from an **unusual** config value or
a hand-made fixture, never a default, so a hardcoded implementation fails.

**Before cycle 1 — done**: `docs/06_world_backdrop.md` (this file). `src/audiovisual/backdrop.ts` and
`adapters/asciiBackdrop.ts` did not exist. The AudioVisual layer's cycles 1–23 were complete and green.

### Pass A — the backdrop as a plain value

Nothing visible changes in this pass. It ends with a whole sky existing as data you can print.

1. **`skyBrightnessAt(sky, y)`.** Hand-made fixture `{ horizon: 0.4, zenith: 0.1 }`, neither value a
   default: `y = 0` returns `0.4`; `y = 100` returns `0.1`; `y = 50` returns the exact midpoint `0.25`;
   `y = 25` returns `0.325`. A constant fails, and a gradient interpolated the wrong way round fails on
   every case but the midpoint. Introduces `SkyGradient`, since this is the first function to name it.
2. **`buildSky(seed, config)`.** Unusual `skyMaxBrightness: 0.11`. Across seeds `1..200`: every `horizon`
   is below `0.11` and every `zenith` is at or below its own `horizon`; and at least one `horizon`
   exceeds `0.09`, which is what proves the cap is the config value rather than some smaller fixed
   number. Same seed twice is deep-equal; two different seeds differ.
3. **`buildBodies(seed, config, sky)` — the census.** Unusual `starCount: { min: 3, max: 3 }` and
   `celestialMinHeight: 60`, with a black sky (`{ horizon: 0, zenith: 0 }`) so no washout applies:
   exactly five bodies; `bodies.map((b) => b.kind)` equals
   `["star", "star", "star", "planet", "moon"]` — the paint-order contract, asserted rather than assumed;
   every position has `y` in `[60, 100)`, `x` in `[-50, 50)`, and `z` exactly `0`. A second case at
   `celestialMinHeight: 99` proves the floor is config-driven. Two seeds give different positions.
   Introduces `CelestialBody`.
4. **`buildBodies` — a brighter sunset washes out the stars.** Decision 5. With `starCount` pinned at
   `{ min: 20, max: 20 }` and `skyMaxBrightness: 0.25`, a near-black sky (`horizon: 0.02`) yields
   strictly more stars than a lit one (`horizon: 0.24`) from the same seed; the moon and the planet are
   present in both, because they are the scenery, not the weather. Asserted as the invariant — more, not
   a pinned count — the way `sparks.test.ts` asserts a wider jitter without pinning random numbers.
   Plus the edge this arithmetic creates, named after the trap: the washout is a fraction **of**
   `skyMaxBrightness`, so a cap of `0` would make it `0 / 0` and silently produce `NaN` stars. A cap of
   `0` must mean no sunset at all and the full star count. Same class of edge as `sparkPosition`'s drag
   of zero, and reachable the same way — the verification list below tells a reader to zero that cap.
5. **`buildGround(seed, config)`.** Unusual `groundPoints: 5` with a degenerate
   `groundHeight: { min: 7, max: 7 }`, which pins every height and makes the whole return value
   assertable exactly: `x` values `-50, -25, 0, 25, 50`, every `height` exactly `7`. A second case with
   `{ min: 30, max: 31 }` asserts every height inside the range **and** at least two distinct values,
   which proves one draw per point rather than one draw shared by all of them. Introduces `GroundPoint`.
6. **`groundHeightAt(ground, x)`.** A hand-made three-point ground so every number is checkable by eye:
   at a point's own `x` it returns that point's height exactly; halfway between two points it returns
   their midpoint; `x` below the first point clamps to the first height and `x` above the last clamps to
   the last.
7. **`buildBackdrop(seed, config)`.** Asserts the result deep-equals `buildSky`, `buildBodies` and
   `buildGround` called with `hashString(`${seed.toString()}:sky`)`, `:bodies` and `:ground`
   respectively — so a naive `createRandom(seed)` reused three times fails, and so does forgetting a
   suffix. Two different seeds differ in all three parts. Introduces `Backdrop`.

**Payoff**: `buildBackdrop(1, config)` in a devtools console prints an entire sky — a gradient, a
scatter of bodies in paint order, and a skyline — with nothing drawn yet.

### Pass B — onto the screen

8. **`rasteriseBackdrop` — the gradient.** Unusual `ascii` fixture `{ columns: 3, rows: 2, ramp: "abcde" }`
   — a five-character ramp with no space in it, so a cell that accidentally drew nothing is visible as a
   failure rather than passing as a space. Backdrop fixture: `sky: { horizon: 1, zenith: 0 }` (uncapped
   on purpose; capping is cycle 2's job, not the adapter's), no bodies, and a flat ground at height `0`.
   Row centres are `y = 75` and `y = 25`, giving brightnesses `0.25` and `0.75`, giving `"bbb\nddd"`. The
   fixture avoids any `.5` rounding tie, so the test does not quietly depend on how `Math.round` breaks
   them, and the height-`0` ground draws nothing, so this test stays green unedited through cycles 9 and 10.
9. **`rasteriseBackdrop` — body glyphs.** Unusual glyphs `{ star: "S", moon: "M", planet: "P", ridge: "R" }`
   so the real defaults cannot pass. Bodies map to cells through exactly the mapping `rasteriseFrame`
   uses — this is the cycle that extracts it as `toCell` and has both callers share it, rather than
   keeping a second copy of the `y` flip that could drift. A body and a spark at one world point
   therefore land in one cell. Includes a star placed at the moon's own position, asserting `"M"` wins —
   paint order doing the work of an overlap test — and a body far outside the box, asserting it is
   clipped rather than wrapped.
10. **`rasteriseBackdrop` — the ridge and the fill, painted last.** A cell is ground when its row-centre
    `y` is at or below `groundHeightAt` at its column-centre `x`; the topmost ground cell in a column is
    the ridge glyph, and every cell below it is `rampChar(groundFillBrightness)`. Fixture: `columns: 4`,
    `rows: 4`, a black sky, and a ground sloping from height `15` at `x = -50` to `100` at `x = 50`,
    which gives a tie-free diagonal staircase of ridge characters with fill beneath. A second case places
    a star inside the landform and asserts the ground covers it.
11. **`overlayGrid(base, over)`.** Base `"abc\ndef"` under foreground `"X  \n Y "` gives `"Xbc\ndYf"`.
    A second case names the trap directly: a space over a space stays a space, and the newline positions
    never move, so the two grids can never drift out of alignment.
12. **`createAsciiRenderer({ target, config, backdrop })`.** The existing test gains `backdrop: null` and
    keeps its assertion unchanged, which is what proves the no-backdrop path still behaves exactly as it
    did. A new case, driven with unusual `columns` and `rows`, asserts the single write equals
    `overlayGrid(rasteriseBackdrop(backdrop, config), rasteriseFrame(frame, config.ascii))` — the
    composition, not a coincidence.
13. **Wire `src/main.ts`.** The page-load seed, one `buildBackdrop` call, and the new option passed to
    `createAsciiRenderer`. Not unit tested, like the rest of that file — proven by loading the page and
    refreshing.

    **Cycles 12 and 13 landed as one commit.** `backdrop` is a required option rather than an optional
    one, which is the point of it — but it also means `tsc` cannot pass while `main.ts` is still calling
    `createAsciiRenderer` without it. Splitting them would have meant either a broken commit or making
    the option optional purely to keep two commits apart, and neither is worth it.

14. **The dark page.** One `<style>` block in `index.html`, per "The white page" above. Its own commit,
    no test impact.
15. **doc-sync.** This file reconciled against what was actually built, `README.md`'s status paragraph,
    `CLAUDE.md`'s status paragraph, and `CHANGELOG.md`. Unlike every previous pass in this project, this
    one **does** warrant a changelog entry: a visible sky is the first user-facing change the project has
    made.

**Payoff**: load the page and the fireworks burst against a sky — a dim glow low down, a scatter of
stars, a moon, a planet, and a dark landform along the bottom. Refresh and get a different one.

## Critical files

| Path                                        | Purpose                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `src/audiovisual/backdrop.ts`               | Cycles 1–7 — the whole core                                       |
| `src/audiovisual/types.ts`                  | `SkyGradient` 1, `CelestialBody` 3, `GroundPoint` 5, `Backdrop` 7 |
| `src/audiovisual/config.ts`                 | `backdrop` key and `ascii.backdropGlyphs`                         |
| `src/audiovisual/adapters/asciiBackdrop.ts` | Cycles 8–11                                                       |
| `src/audiovisual/adapters/asciiGrid.ts`     | `rampChar` exported; `rasteriseFrame` behaviour unchanged         |
| `src/audiovisual/adapters/ascii.ts`         | Cycle 12 — the one composition seam                               |
| `src/main.ts`                               | Cycle 13 — page-load seed and wiring                              |
| `index.html`                                | Cycle 14 — the dark page                                          |

## Out of scope

- **Motion.** Every body is static and so is the ground. Drifting stars, a rising moon, or a sky that
  changes over a session would make `buildBodies` take a time argument and the adapter rebuild its base
  grid on some cadence. The contracts do not prevent it; nothing here implements it.
- **Colour.** `05_audio_visual_layer.md` already lists colour in the grid as out of scope, and the same
  reasoning holds here: the ASCII adapter reads brightness only, so a sunset is ramp levels rather than
  hue. `SkyGradient` would gain a colour per end in the cycle a colour-capable adapter needs it — not
  before a test can drive it.
- **Keeping a sky you like.** Decision 1. A seed in the URL hash would do it in a few lines, and would
  also make a sky shareable. Deliberately not built.
- **Clouds, weather, a horizon glow that tracks a sun position, or more than one planet.** Each is a new
  body kind or a new field on `Backdrop`, behind the same contracts.
- **Occlusion.** A spark that falls below the skyline draws **over** the hills, because the foreground
  always wins a cell. That is correct under the compositing rule and will look wrong to someone
  expecting a firework to disappear behind a hill. Making it disappear means a renderer reading the
  ground's height to make a decision, which by this project's own rule would move `Ground` out of this
  layer and onto Action's snapshot. That is the condition to revisit this under; nothing here assumes it.
- **Reacting to a resized window.** `ascii.columns` and `ascii.rows` are fixed config, and the base grid
  is rasterised once against them. A resize means building a new renderer, exactly as it already does for
  everything else in this layer.

## Verification

- `npx vitest run` — every cycle's tests green, no real timers.
- `npx tsc` — clean under `strict`.
- `npx eslint .`, `npx prettier --check .`, `npx knip` — clean before each commit; the pre-commit hook
  enforces it.
- `npm run build` — still produces a working `dist/`.
- `grep -rE "Math.random|Date.now|performance.now" src/audiovisual/` — no _calls_. The new `Date.now()`
  and `Math.random()` live in `src/main.ts` only. There is one hit, in `webAudio.ts`, and it is a comment
  saying not to use `Math.random()` — pre-existing, and the same caveat applies to `docs/05`'s identical
  check.
- `grep -nE '"\^"|"O"|"o"|"\*"' src/audiovisual/backdrop.ts` — no hits. The glyph house rule: the core
  names no character. `config.ts` does hold the default glyphs, which is deliberate (decision 6) and not
  a violation — declaring a tunable is not deciding how to draw.
- Manual, in `npm run dev`:
  - Load the page. A dim sky, brighter low down than overhead; a scatter of stars; one moon; one planet;
    a dark landform along the bottom.
  - Refresh ten times. A different sky each time — some near-black and full of stars, some with a visibly
    lit horizon and only a few.
  - Press keys. Every shell, spark and trail stays clearly visible against the brightest sky the seed can
    produce, and a low burst still reads over the ground.
  - Set `backdrop.skyMaxBrightness` to `0` and reload: a black sky with stars, moon, planet and ground
    all still drawn.
  - Set `backdrop.starCount` to `{ min: 0, max: 0 }` and reload: no stars, no crash, everything else
    intact.
  - Watch the frame rate with devtools open. Unchanged from before — the backdrop rasterises once, at
    construction, not per frame.

## Explicitly not in this plan

Motion, colour, occlusion, seed persistence, and any renderer beyond ASCII. This plan draws one static
sky per page load, behind fireworks that still win every cell they touch.

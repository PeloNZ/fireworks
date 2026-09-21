# Fireworks game — 8-bit renderer build plan (v1)

See `01_intent.md` for the overall vision, `05_audio_visual_layer.md` for the
AudioVisual layer this renderer plugs into, `06_world_backdrop.md` for the sky,
scenery and ground it draws, and `07_emoji_renderer.md` for the second
renderer, whose three-file shape this one copies. Those documents stay closed
as their own v1 records; this one starts its cycles again at 1.

This document assumes no background in graphics programming. Where a decision
needs a concept explained, the explanation is here in full.

**Out of scope here**: a UI to switch renderers, running two renderers at once,
reflowing on window resize, and any renderer beyond ASCII, emoji and 8-bit.

## Context

The project has two renderers, both drawing text into a `<pre>`: `ascii` (an
80×40 brightness ramp) and `emoji` (a 40×40 coloured glyph grid). Both are
picked by `?renderer=` through `selectRenderer` against a table in `main.ts`.
Both throw away two things the display list already carries: `Sprite.color`
(ASCII only) and `Sprite.size`, a radius in world units that neither renderer
can honour because a character cell is the smallest thing either can draw.

This plan adds a third renderer, `?renderer=pixel`: 8-bit pixel art on a
`<canvas>`, filling the browser viewport, in a fixed 16-colour palette. It is
the first renderer that can draw a sprite as a shape rather than a cell, and
the first that can show a real colour instead of a nearest-glyph stand-in.

Decisions taken with the user before writing this:

- **Fill the viewport, keep bursts round.** Pixels stay square and a ring burst
  stays circular. The renderer shows a wider slice of the world to the left and
  right instead of stretching. Stars and the moon only generate within world
  `x ∈ [-50, 50]`, so on a wide screen the outer sides are empty sky. Accepted.
- **Chunkiness: 1.6 pixels per world unit.** A shell is about 5 pixels across,
  a spark 1–2.
- **`ascii` stays the default** when no `?renderer=` is given.

---

## The geometry: a wide box with square pixels

World space is square: `x ∈ [-50, 50)`, `y ∈ [0, 100)`. A viewport is not.

The rule: **the full height of the world always fits, and the width follows the
window.**

- `pixel.rows` is fixed at **160**. World `y ∈ [0, 100)` maps across all 160
  rows, so one pixel is `100 / 160 = 0.625` world units tall.
- A pixel must be square, so it is also `0.625` world units wide. The visible
  world half-width therefore falls out of the grid shape:

  ```
  worldHalfWidth = 50 * columns / rows
  ```

  and one pixel is `100 / rows` world units on both axes, automatically.

- `pixel.columns` is computed in `main.ts` from the real viewport aspect:
  `Math.round(rows * innerWidth / innerHeight)`. On a 16:9 screen that is
  **284 × 160**, showing world `x ∈ [-88.75, 88.75)`.

Consequences, all accepted:

- Square pixels and round bursts on every window shape, with no black bars.
- Stars, moon and planet cluster in the middle ~56% of a 16:9 screen, because
  `buildBodies` only places them within `x ∈ [-50, 50]`. The sky gradient fills
  the full width (it is a function of `y` only) and the ground extends flat to
  both edges, because `groundHeightAt` holds the nearest endpoint's height
  outside the polyline. No change to `backdrop.ts`.
- The grid is sized once, at page load. Resizing the window stretches the
  canvas until you reload. This matches the backdrop, which is already seeded
  once per page load and never regenerated.
- `cells.ts` is **not touched**. `toCell` hardcodes the ±50 box and its row
  maths is subtly not a plain floor; changing it would alter ASCII and emoji
  output at every row boundary. The pixel renderer gets its own `toPixel`.

---

## Why a canvas renderer is not the emoji renderer with smaller cells

Three things change, and only three.

1. **A sprite becomes a shape.** `Sprite.size` is a radius in world units
   (`shellSize: 1.5`, `sparkSize: 0.6`). `contestCells` cannot be reused for
   this, and not only because it ignores `size`: it returns _one sprite per
   cell_, decided before any shape exists. Two discs can overlap on some pixels
   and not others, so the brightest-wins contest has to run **per pixel, after
   the discs are expanded**. There is no version of `contestCells` that answers
   that question.

2. **Colour becomes an index, not a glyph.** Everything else is the emoji
   renderer with a number where the glyph was: the same `hueOf`, the same
   nearest-hue-the-short-way-round rule, the same `saturationFloor` fallback,
   the same brightness ramp. `sparkGlyph` returns `"🔴"`; `sparkIndex` returns
   `8`. That is the whole difference.

3. **The background is a separate plane, not a composited grid.** ASCII and
   emoji write one string into one `<pre>`, so they must merge backdrop and
   frame themselves (`overlayGrid`, `overlayEmojiGrid`). The pixel renderer
   draws two stacked canvases and lets the browser do it.

---

## Why two canvases, and why that is the authentic 8-bit answer

"Background on the negative z axis, behind everything" is layering, not a new
coordinate. Nothing gains a `z` field; `Vec3.z` stays `0`.

Two `<canvas>` elements, both `position: fixed; inset: 0`, same internal
dimensions, same CSS size:

- **The background plane**, `z-index: 0`, painted **exactly once** at
  construction. Sky, bodies, ground. Never touched again.
- **The sprite plane**, `z-index: 1`, repainted every frame. Every pixel the
  frame does not draw is written with **alpha 0**, so the background plane
  shows through.

This is how 8-bit console hardware actually worked — a background plane and a
sprite plane, composited by the display, never by the program. It is also what
preserves the existing "rasterise the backdrop once, outside the closure"
optimisation that `ascii.ts` documents, and it makes "the backdrop is painted
once" an assertion a test can make rather than a code shape a reviewer checks.

The one thing it needs: `putImageData` **replaces** destination pixels
including their alpha — it does not blend. So the sprite plane's buffer must
carry real transparency. `toRgba` takes a `transparentIndex` parameter: the
background plane passes `null` (every pixel opaque), the sprite plane passes
`pixel.blank`. That is the entire cost, and it deletes the `overlayPixelBuffer`
function the single-canvas design would have needed.

**The CSS trap to avoid:** `z-index: -1` on a child of a `position: static`
parent paints _behind_ the parent's background. `body` here is an opaque
`#05060a`, so a literal `z-index: -1` canvas would vanish. Both canvases are
`position: fixed` with explicit non-negative `z-index`, which puts them above
the body background and orders them against each other.

---

## Raw 2D rendering in the browser, explained

No background in graphics programming is assumed here.

**A canvas is a rectangle of pixels you write numbers into.** Nothing more. A
`<canvas width="284" height="160">` has 45,440 pixels, each four bytes: red,
green, blue, alpha (opacity), every one an integer 0–255. That is 181,760
bytes, a flat `Uint8ClampedArray`. Pixel at row `r`, column `c` starts at byte
`(r * 284 + c) * 4`.

**Write them all at once, not one at a time.** The canvas API offers
`fillRect(x, y, 1, 1)` per pixel, which is many times slower than building the
whole byte array yourself and handing it over in a single `putImageData` call.
Individual draw calls are the cost; the pixels are not.
([MDN, Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas))

**Draw small, display big.** The canvas's `width`/`height` **attributes** set
how many pixels exist. Its CSS `width`/`height` set how big it looks. Set the
attributes to 284×160 and the CSS to `100vw`/`100vh`, and the browser scales
each drawn pixel up to a block about 7 screen pixels across. That scaling is
what produces pixel art, and it is also why the renderer is cheap: it fills
45,000 pixels a frame, not two million.

**Turn smoothing off or it is not pixel art.** By default the browser blurs
when it scales an image up, so a hard-edged 284×160 image becomes a smear. Two
switches, both needed:
`image-rendering: pixelated` in CSS (for the element's own upscale) and
`ctx.imageSmoothingEnabled = false` in JS.
([MDN, Crisp pixel art look](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look),
[MDN, imageSmoothingEnabled](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled))
MDN's caveat applies: at a non-integer scale factor some rows of pixels land
one screen pixel taller than their neighbours. Filling an arbitrary viewport
means accepting that; it is invisible in motion and is the price of no bars.

**Indexed colour is what makes it 8-bit.** Rather than computing an RGB value
per pixel, the renderer works in a buffer of **palette indices** — one byte per
pixel, each a number 0–15 naming a slot in a fixed 16-colour table. The last
step expands indices to RGBA. Three payoffs at once: it is what real 8-bit
hardware did, so the look is authentic rather than imitated; a test can assert
`buffer[offset] === 8` as cleanly as the existing tests compare strings; and
the buffer is a quarter the size.

The palette is
[PICO-8's 16 colours](https://lospec.com/palette-list/pico-8) —
`#000000 #1D2B53 #7E2553 #008751 #AB5236 #5F574F #C2C3C7 #FFF1E8 #FF004D
#FFA300 #FFEC27 #00E436 #29ADFF #83769C #FF77A8 #FFCCAA`. Indices 8–14 are the
bright ones and are exactly firework colours.

---

## Decisions

1. **A sound-set-style swap, not a new layer.** `Renderer` stays
   `(frame: Frame) => void`. `src/audiovisual/types.ts` gains **nothing** — the
   third renderer proves the existing contract was already right.

2. **The pixel trio mirrors the emoji trio.** `adapters/pixel.ts` (thin, owns
   the port and the palette expansion), `adapters/pixelGrid.ts` (pure frame →
   index buffer), `adapters/pixelBackdrop.ts` (pure backdrop → index buffer).
   Same three files, same responsibilities, same names one letter apart.

3. **Two shared helpers are extracted first, before any pixel code.**
   `hueDistance` is private inside `emojiGrid.ts` and the pixel renderer needs
   the same rule. Importing adapter-to-adapter is the wrong direction, so
   Pass A lifts `nearestHue` into `color.ts` and `rampLevel` into a neutral
   `adapters/ramp.ts`, rewriting the emoji functions onto them. The existing
   emoji tests pass unmodified; that is the regression check.

4. **The brightness contest runs per pixel, and starts at `-1`.** Brightest
   wins, earliest holds a tie — byte-identical to `contestCells`, because the
   opposite rule makes a decaying trail paint over the shell in front of it.
   The parallel brightness buffer initialises to `-1`, not `0`: `frame.ts`
   produces `brightness: 0` for a fully decayed trail, and a zero-filled buffer
   would silently swallow it.

5. **A sprite smaller than a pixel still paints one pixel.** At 160 rows a
   spark's radius is 0.96 pixels, so a pure distance test lights nothing and
   every spark in the game disappears. When the disc covers no pixel centre,
   the pixel containing the centre is painted.

6. **A sprite's radius is scaled by its brightness.** `frame.ts` gives a
   shell's trail points `size: config.shellSize` — identical to the shell
   itself. This is the first renderer that reads `size`, so without scaling, a
   rocket drags four full-size discs behind it at brightness 1.0, 0.86, 0.73
   and 0.6: a chain of blobs the same width as the shell. Multiplying the
   radius by `sprite.brightness` makes a trail taper and makes a fading spark
   shrink, in one multiplication, with no config field and no branch on `kind`.
   The blank rule below only hides the _fully_ decayed point; every other
   point needs this.

7. **`pixel.trail[0]` must equal `pixel.blank`.** The same house rule
   `emoji.trail[0] === emoji.blank` enforces: a decayed trail has to vanish
   exactly where ASCII would show nothing, or it drags a visible smear across
   the sky long after the burst is over.

8. **The ground is a true silhouette.** `asciiBackdrop.ts` says the landform
   "has to be drawn in ink to exist at all, which is why this is a lit shape
   rather than a true silhouette." A canvas can draw the real thing: one index
   (`0`, black), no ridge glyph, no fill brightness. `config.backdrop.
groundFillBrightness` simply goes unread by this adapter. It reads because
   `skyBrightnessAt` is brightest at the horizon, so black meets its lightest
   neighbour.

9. **Bodies are discs, not pixels.** `discCells` already exists by the time the
   backdrop needs it, and `CelestialBody`'s own docblock anticipates "a disc in
   a future Canvas one". A one-pixel moon would undercut the point of building
   this. Radii in world units, in config.

10. **Its own document.** `docs/08_sound_effects.md` stays closed as its
    record; this file's cycles start again at 1.

---

## Key contracts

```ts
// src/audiovisual/color.ts                                        — cycle 1
export function nearestHue<T extends { readonly hue: number }>(
  hue: number,
  entries: readonly T[],
): T;
// hueDistance moves here from emojiGrid.ts and stays private.

// src/audiovisual/adapters/ramp.ts  (new)                         — cycle 2
export function rampLevel<T>(brightness: number, levels: readonly T[]): T;

// src/audiovisual/adapters/pixelGrid.ts
export function sparkIndex(color: Rgb, pixel: PixelConfig): number; // 3
export function indexFor(sprite: Sprite, pixel: PixelConfig): number; // 4

export function worldHalfWidth(grid: {
  // 5
  readonly columns: number;
  readonly rows: number;
}): number;
export function pixelCentreX( // 5
  column: number,
  grid: { readonly columns: number; readonly rows: number },
): number;

export function toPixel( // 6
  x: number,
  y: number,
  grid: { readonly columns: number; readonly rows: number },
): number | null; // flat row-major offset, or clipped

export function pixelCentreY( // exported at 13, for pixelBackdrop.ts's sky
  row: number,
  grid: { readonly columns: number; readonly rows: number },
): number;

export function discCells( // 7
  centre: { readonly x: number; readonly y: number },
  radius: number, // world units
  grid: { readonly columns: number; readonly rows: number },
): readonly number[]; // flat row-major offsets

export function paintFrame(frame: Frame, pixel: PixelConfig): Uint8Array;
//                                              cycles 10, 11, 12

// src/audiovisual/adapters/pixelBackdrop.ts              — cycles 13, 14, 15
export function paintBackdrop(
  backdrop: Backdrop,
  pixel: PixelConfig,
): Uint8Array;

// src/audiovisual/adapters/pixel.ts
export function toRgba( // 16
  indices: Uint8Array,
  palette: readonly string[],
  transparentIndex: number | null,
): Uint8ClampedArray<ArrayBuffer>;

export interface PixelTarget {
  // 17
  paint(
    pixels: Uint8ClampedArray<ArrayBuffer>,
    width: number,
    height: number,
  ): void;
}

export function createPixelRenderer(options: {
  // 17
  readonly background: PixelTarget | null;
  readonly sprites: PixelTarget;
  readonly config: AudioVisualConfig;
  readonly backdrop: Backdrop | null;
}): Renderer;
```

`PixelConfig` above is shorthand for `AudioVisualConfig["pixel"]`; it is not a
named export (`knip` flags a type nothing imports).

Write the generic argument `Uint8ClampedArray<ArrayBuffer>` explicitly. Under
TypeScript 6 the DOM lib declares `ImageData`'s array as
`Uint8ClampedArray<ArrayBuffer>`, and a bare `Uint8ClampedArray` widens to
`ArrayBufferLike` and fails to assign. Leave it off and nothing complains until
the `main.ts` call in cycle 18 — the one untested file, two cycles after the
mistake is made and a long way from where it looks like it came from.

---

## The port, and its fake

```ts
export interface PixelTarget {
  paint(
    pixels: Uint8ClampedArray<ArrayBuffer>,
    width: number,
    height: number,
  ): void;
}
```

One method. No `ImageData`, no `CanvasRenderingContext2D`, no element — modelled
on `AudioContextLike` in `webAudio.ts`, which names only the slice of the real
API it calls. `ImageData` exists as a _type_ in tests (tsconfig has
`"lib": ["ES2023", "DOM"]`) but not as a _value_ in node, so a test that
constructed one would typecheck and then throw. The port is what keeps it out;
no test in this plan touches it.

The fake, shaped like `createTarget()` in `ascii.test.ts`:

```ts
function createTarget(): {
  readonly target: PixelTarget;
  readonly paints: {
    pixels: Uint8ClampedArray<ArrayBuffer>;
    width: number;
    height: number;
  }[];
} {
  const paints: {
    pixels: Uint8ClampedArray<ArrayBuffer>;
    width: number;
    height: number;
  }[] = [];
  return {
    target: {
      paint: (pixels, width, height) => {
        paints.push({ pixels, width, height });
      },
    },
    paints,
  };
}
```

The real side, and the only place in the project that names `ImageData`, in
`main.ts` — one of these per canvas, background and sprites alike:

```ts
const context = canvas.getContext("2d");
if (context === null) {
  throw new Error("pixel renderer: 2d canvas context unavailable");
}
context.imageSmoothingEnabled = false;
const target: PixelTarget = {
  paint: (pixels, width, height) => {
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
  },
};
```

---

## Config

A new `pixel` slice in `AudioVisualConfig`, grown one cycle at a time. It
mirrors `emoji` field for field, with a palette index where the glyph was.

```ts
interface CelestialStyle {           // unexported: knip only sees exports
  readonly index: number;
  readonly radius: number;           // world units
}

readonly pixel: {
  readonly sparkHues: readonly {
    readonly hue: number;
    readonly index: number;
  }[];                                                        // cycle 3
  readonly desaturated: number;                               // cycle 3
  readonly saturationFloor: number;                           // cycle 3
  readonly shell: number;                                     // cycle 4
  readonly trail: readonly number[];    // trail[0] === blank  // cycle 4
  readonly columns: number;             // overridden at runtime, cycle 10
  readonly rows: number;                // the chunkiness dial, cycle 10
  readonly blank: number;                                     // cycle 10
  readonly sky: readonly number[];      // dim to bright       // cycle 13
  readonly bodies: {                                          // cycle 14
    readonly star: CelestialStyle;
    readonly moon: CelestialStyle;
    readonly planet: CelestialStyle;
  };
  readonly ground: number;              // one index, a silhouette, cycle 15
  readonly palette: readonly string[];  // 16 hex strings      // cycle 16
};
```

Defaults, beside their emoji counterparts. The `hue` column is **identical** to
`emoji.sparkHues`:

|               | emoji                                                | pixel                                                    |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| `sparkHues`   | `0 🔴, 30 🟠, 55 🟡, 130 🟢, 200 🔵, 280 🟣, 330 🌸` | `0→8, 30→9, 55→10, 130→11, 200→12, 280→13, 330→14`       |
| `desaturated` | `⚪`                                                 | `7` (`#FFF1E8`)                                          |
| `shell`       | `🚀`                                                 | `7`                                                      |
| `trail`       | `["⬛","💫","✨"]`                                   | `[0, 5, 6]`                                              |
| `blank`       | `"⬛"`                                               | `0`                                                      |
| `sky`         | `["⬛","🌌","🟦","🟪","🟧"]`                         | `[0, 1, 13, 12, 9]`                                      |
| bodies        | `⭐🌙🪐`                                             | `star {7, r 0.8}`, `moon {15, r 6}`, `planet {9, r 2.5}` |
| ground        | `🌲` + `🟫`                                          | `0` — silhouette                                         |
| grid          | `40 × 40`                                            | `284 × 160`, columns recomputed at load                  |

Two notes the doc must carry.

- The `hue` numbers are the hue each slot **claims**, not the swatch's measured
  hue. PICO-8's `#FF004D` measures at hue 342 and `#FF77A8` at 338 — four
  degrees apart, which would make one of them unreachable. Naming the intended
  hue is what spreads them across the wheel.
- With `skyMaxBrightness: 0.25` and five sky levels, `round(0.25 × 4) = 1`, so
  the brightest sky reaches index 1 (`#1D2B53`, dark blue) and the upper three
  are only reachable by raising the cap. This is the same banding `docs/06` and
  `docs/07` already document, not a new problem.

`Object.freeze` at every level, including each `sparkHues` entry and each
`bodies` entry. There is no `deepFreeze` helper here and a missed level is
invisible at runtime.

---

## File layout

| Path                                        | Role                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `docs/09_8bit_renderer.md`                  | This plan, written before cycle 1                                                              |
| `src/audiovisual/color.ts`                  | Cycle 1 — gains `nearestHue`, absorbs `hueDistance`                                            |
| `src/audiovisual/adapters/ramp.ts`          | Cycle 2 — new, `rampLevel`                                                                     |
| `src/audiovisual/adapters/pixelGrid.ts`     | Cycles 3–12 — pure frame → index buffer (`pixelCentreY` exported at 13 for `pixelBackdrop.ts`) |
| `src/audiovisual/adapters/pixelBackdrop.ts` | Cycles 13–15 — pure backdrop → index buffer                                                    |
| `src/audiovisual/adapters/pixel.ts`         | Cycles 16–17 — `toRgba`, `PixelTarget`, the factory                                            |
| `src/audiovisual/config.ts`                 | The `pixel` slice, cycles 3, 4, 10, 13, 14, 15, 16                                             |
| `src/audiovisual/adapters/emojiGrid.ts`     | Cycles 1–2 — rewritten onto the shared helpers                                                 |
| `src/main.ts`                               | Cycle 18 — registry widened, viewport read, `ImageData`                                        |
| `index.html`                                | Cycle 19 — the canvas CSS                                                                      |

---

## TDD build cycles

Test-driven, same discipline as every plan before it: write the failing test
first, then the minimum code to pass, one commit per cycle. Every cycle drives
its assertion from an unusual config value or a hand-made fixture, never a
default, so a hardcoded implementation fails it.

**Before cycle 1**: `docs/09_8bit_renderer.md` is written. Two renderers exist,
all tests green, `pixelGrid.ts` and `ramp.ts` do not exist.

### Pass A — the shared seams

No pixel code. Both existing renderers stay green, unmodified tests and all.

1. **`nearestHue` in `color.ts`; `sparkGlyph` rewritten onto it.** Fixture:
   `nearestHue(350, [{ hue: 10, name: "A" }, { hue: 200, name: "B" }])` returns
   the `hue: 10` entry; an empty list throws. The load-bearing case: 350 and 10
   are 20° apart the short way and 340° the long way, so an absolute-difference
   implementation returns `B`. An easier case (hue 15 → `A`) passes with the
   naive implementation and proves nothing. Generic over
   `T extends { readonly hue: number }`, so emoji's `{hue, glyph}` and pixel's
   `{hue, index}` both fit with **no change to the emoji config shape**.
   **`emojiGrid.test.ts` does not change** — that is the regression check.

2. **`rampLevel` in `adapters/ramp.ts`; `rampGlyph` rewritten onto it.**
   Fixture: `rampLevel(0, [11, 22, 33])` → `11`; `0.4` → `22`; `1` → `33`;
   `-5` → `11`; `2` → `33`. **Three** entries, because a two-entry list cannot
   tell "dimmest first" from an off-by-one. Numbers, not strings, so a
   string-indexing implementation fails outright. `rampChar` stays alone — it
   indexes a string and is genuinely a different function.

### Pass B — colour becomes a palette index

3. **`sparkIndex` in `pixelGrid.ts`, and the `pixel` config key.** Fixture:
   `sparkHues: [{ hue: 10, index: 3 }, { hue: 200, index: 12 }]`,
   `saturationFloor: 0.5`, `desaturated: 6`. Assertions: a saturated colour at
   hue 350 → `3`; a colour at saturation `0.3` → `6` whatever its hue; a colour
   at saturation `0.6` → its hue's index, not `6`. The load-bearing case is the
   floor boundary driven at `0.5`, never the `0.15` default, so a hardcoded
   floor fails. Reuse `emojiGrid.test.ts`'s `atHue(hue, saturation)` helper
   shape so each case names the hue it means.

4. **`indexFor` in `pixelGrid.ts`; `pixel.shell`, `pixel.trail`.** Fixture:
   `shell: 2`, `trail: [4, 5, 6]`. Assertions: a `"shell"` sprite coloured hot
   pink → `2` (colour never read); a `"spark"` → `sparkIndex`'s answer; a
   `"trail"` at brightness `0.5` → `5` (brightness read, colour not). All three
   kinds land in one cycle because `noImplicitReturns` plus the three-member
   `kind` union means a partial `switch` does not compile.

### Pass C — the wide box and the disc painter

5. **`worldHalfWidth` and `pixelCentreX` in `pixelGrid.ts`.** Fixture:
   `{ columns: 10, rows: 8 }`. Assertions: `worldHalfWidth` → `62.5`;
   `pixelCentreX(0, grid)` → `-56.25` and `pixelCentreX(9, grid)` → `56.25`.
   The load-bearing case: `columns !== rows`, so a copy of `columnCentreX`'s
   ±50 assumption fails. Second assertion, and the reason this function exists:
   a pixel's width `2 * worldHalfWidth / columns` equals its height
   `100 / rows` for this grid and for a second, differently-shaped one — square
   pixels are a property of the formula, not of a chosen number.

6. **`toPixel` in `pixelGrid.ts`.** Fixture: same 10×8 grid. Assertions: a point
   at the centre of a known pixel returns that pixel's flat offset
   `row * columns + column`; a point beyond `±worldHalfWidth` returns `null`;
   `y = 100` and `y < 0` return `null`. The load-bearing case: because
   `columns !== rows`, `row * columns + column` cannot be confused with
   `column * rows + row`. Clipping returns `null` rather than wrapping, the
   same rule `toCell` documents.

7. **`discCells` — the disc.** Fixture: 10×8 grid, centre `{ x: 0, y: 50 }`, a
   radius chosen so every pixel centre sits at least one world unit clear of
   the boundary (no rounding ties, the discipline `docs/07`'s sky fixture uses).
   Assertion: `expect(Array.from(discCells(...))).toEqual([...])` against the
   exact offsets, computed when the red test is written. The load-bearing case:
   the expected set is a genuine disc — a two-four-four-two shape — so an
   axis-aligned bounding box implementation fails. **Settle the assertion style
   here**: `Array.from(buffer)`, because `expect(new Uint8Array([1,2]))
.toEqual([1,2])` fails on constructor mismatch in vitest, and discovering
   that at cycle 14 means rewriting eight cycles.

8. **`discCells` — a sub-pixel sprite still paints one pixel.** Fixture: same
   grid, centre `{ x: 0, y: 50 }`, `radius: 0.1`. Assertion: exactly one offset,
   equal to `toPixel(0, 50, grid)`. **This is the cycle the whole renderer
   depends on.** At radius 0.1 the nearest pixel centre is world units away and
   a pure distance test returns `[]`. At 160 rows a spark's radius is 0.96
   pixels, so without this rule every spark in the game is invisible and only
   shells render.

9. **`discCells` — clipping at the edge.** Fixtures: (a) a centre outside the
   box with a radius large enough to overlap it; (b) a centre outside with a
   radius that does not reach. Assertions: (a) returns only the offsets inside
   the box, none of them on the opposite edge column; (b) returns `[]`. The
   load-bearing cases: (a) proves a shell drifting off the left edge slides off
   rather than popping out — an implementation that clips on the centre, as
   both existing renderers do, returns `[]` and fails. (b) proves cycle 8's
   centre rule does **not** clamp an off-grid centre onto column 0, which would
   smear a departing sprite along the border. The absent opposite-edge offsets
   are the no-wraparound check.

10. **`paintFrame` in `pixelGrid.ts`; `pixel.columns`, `pixel.rows`,
    `pixel.blank`.** Fixture: `columns: 10, rows: 8, blank: 7` — **not** `0`, so
    a hardcoded zero-fill fails — and one spark sprite with `size: 0.1`.
    Assertions: `Array.from(buffer)` equals eighty `7`s with the spark's offset
    holding its index; `buffer.length === 80`; `buffer instanceof Uint8Array`.

11. **`paintFrame` — the brightness contest.** Three assertions on one grid, all
    sprites at one position with `size: 0.1`. (a) sprite A at brightness `0.9`
    then sprite B at `0.2` → the pixel holds A's index. (b) A and B both at
    `0.5`, different indices → the pixel holds A's. (c) a lone sprite at
    brightness `0` → its index is painted, not `blank`. The load-bearing cases:
    (a) is the rule a naive painter's algorithm **reverses**, and every byte of
    this file is new code that could get it backwards. (b) pins the tie-break
    to `>=` on the incumbent, byte-identical to `contestCells`. (c) is the trap
    inside the fix — the brightness buffer must initialise to `-1`, because a
    fully decayed trail has `brightness: 0` and a zero-filled buffer eats it.

12. **`paintFrame` — the radius tapers with brightness.** Fixture: one sprite
    with a radius large enough to cover several pixels, painted twice — once at
    `brightness: 1`, once at `brightness: 0.25`. Assertions: the dim buffer
    lights strictly fewer pixels than the bright one, and the lit set equals
    `discCells(centre, size * 0.25, grid)` exactly. The load-bearing case: an
    unusual brightness, never `1`, so an implementation that passes
    `sprite.size` straight through fails. One multiplication, no config field,
    no branch on `kind` — a fading spark shrinks by the same rule that makes a
    trail taper. Without it, a rocket drags four discs the width of its own
    shell (decision 6).

### Pass D — the background plane

13. **`paintBackdrop` in `pixelBackdrop.ts` — the sky; `pixel.sky`.** Fixture:
    `columns: 3, rows: 2, sky: [90, 91, 92, 93, 94]`, an **uncapped**
    `{ horizon: 1, zenith: 0 }`, flat ground at height 0. Assertion:
    `[91, 91, 91, 93, 93, 93]` — row centres at `y = 75` and `y = 25` give
    brightness `0.25` and `0.75`, so `round(0.25 × 4) = 1` and
    `round(0.75 × 4) = 3`, neither a rounding tie. The sky must fill **every**
    pixel here, before bodies or ground exist, because the background plane is
    fully opaque by contract. Uncapped on purpose: capping is `buildSky`'s job,
    not an adapter's.

14. **`paintBackdrop` — bodies as discs; `pixel.bodies`.** Fixture: the 10×8
    grid, flat sky, `bodies.moon = { index: 42, radius: <cycle 7's radius> }`,
    one moon at `{ x: 0, y: 50 }`. Assertion: exactly cycle 7's offsets hold
    `42`. Second case: a star placed at the moon's own position **after** it
    wins, because paint order does the work of an overlap test — the same rule
    the ASCII and emoji backdrops use, with no brightness contest inside a
    backdrop. Bodies are **not** scaled by brightness (cycle 12's rule): a
    `CelestialBody` has no brightness field, by design.

15. **`paintBackdrop` — the ground silhouette; `pixel.ground`.** Fixture:
    `columns: 4, rows: 4` (square, so `worldHalfWidth` is 50 and the polyline
    spans it exactly), black sky, `ground: 55`, and a polyline with control
    points **on the column centres** so the sampled heights are exact:

    ```ts
    ground: [
      { x: -50, height: 25 },
      { x: -37.5, height: 25 },
      { x: -12.5, height: 50 },
      { x: 12.5, height: 75 },
      { x: 37.5, height: 100 },
      { x: 50, height: 100 },
    ];
    ```

    Column centres are -37.5, -12.5, 12.5, 37.5; row centres are 87.5, 62.5,
    37.5, 12.5. Sampled heights of 25, 50, 75 and 100 each sit **exactly
    halfway between two row centres**, 12.5 world units clear of both — half a
    pixel of margin, the widest a 4×4 grid allows, and no rounding tie
    anywhere. Assertion: the staircase — column 0 ground on row 3 only,
    column 1 rows 2–3, column 2 rows 1–3, column 3 all four rows. Second case:
    a body inside the landform is covered, because ground paints last. The
    load-bearing point: one index, no ridge, no fill. This **inverts** an
    existing constraint — `asciiBackdrop` needs
    `groundFillBrightness > skyMaxBrightness` or the landform vanishes into the
    horizon; the pixel renderer needs the opposite, a ground darker than the
    sky it meets. The doc must say so.

### Pass E — onto the screen

16. **`toRgba` in `pixel.ts`; `pixel.palette`.** Fixture:
    `palette = ["#010203", "#fe0405"]`, `indices = Uint8Array([1, 0])`.
    Assertions: with `transparentIndex: null`, `Array.from(result)` equals
    `[254, 4, 5, 255, 1, 2, 3, 255]`; with `transparentIndex: 0`, the second
    pixel's four bytes are `[0, 0, 0, 0]`; `result instanceof
Uint8ClampedArray`; an index past the end of the palette throws. The
    load-bearing case: a two-colour palette with byte values nothing else in
    the project uses, proving RGBA order, the opaque alpha, the ×255 round trip
    through `parseHexColor` (exact — `1/255*255 === 1`), and the
    four-bytes-per-pixel stride. The transparency case is what makes two planes
    possible at all. The out-of-range throw is the standing pattern
    (`rampChar`, `firstColor`) and is forced anyway by
    `noUncheckedIndexedAccess`.

17. **`createPixelRenderer` and `PixelTarget` in `pixel.ts`.** Two fake targets,
    **unusual `columns: 7, rows: 3`**. Assertions: (a) `background.paints` has
    length **1** after construction and **still 1** after two frames — the
    background plane is painted once, and this is the assertion the two-canvas
    design buys that a single canvas could not make; (b) `sprites.paints` has
    length 2 after two frames, and each payload equals
    `toRgba(paintFrame(frame, pixel), pixel.palette, pixel.blank)` with
    `width === pixel.columns` and `height === pixel.rows`; (c) with
    `backdrop: null` and `background: null`, the sprite plane still paints and
    nothing throws. `width` and `height` are asserted separately so a
    transposed buffer fails.
    `background` is typed `PixelTarget | null` so `main.ts` can skip creating
    the second canvas entirely when there is no backdrop, rather than leaving
    an opaque black element sitting over nothing.

18. **Wire `src/main.ts` — UNTESTED.** The registry value type widens from
    `(target: TextTarget) => Renderer` to `(host: HTMLElement) => Renderer`;
    each entry creates and appends its own node, so `grid.className =
rendererName` moves into the `ascii` and `emoji` entries. The `pixel` entry
    reads `window.innerWidth / innerHeight`, computes `columns`, builds the
    config override, creates both canvases, and wraps each context's
    `putImageData` in a `PixelTarget`. `selectRenderer` is untouched — it is
    generic and already serves `soundSets`.
    **The `#app` guard changes shape.** Today `if (app) { app.append(...) }`
    tolerates a missing host because `grid` exists independently; once each
    entry creates its own node, a null `app` means there is nowhere to render,
    so this becomes an early `throw`.
    **What proves it instead:** cycle 17 covers the factory,
    `selectRenderer.test.ts` covers the lookup and fallback rule, and
    `ascii.test.ts`/`emoji.test.ts` cover the other two entries. What is left is
    wiring, proven by loading the page. Same accepted tradeoff as `docs/07`
    cycle 12 and `docs/08` cycle 3.
    `imageSmoothingEnabled = false` goes on **both** contexts — both planes
    upscale. `Math.round` can give an odd column count, which puts world
    `x = 0` mid-pixel rather than on a pixel boundary; harmless, and the knob
    if the centre ever needs to land exactly.

19. **The canvas CSS in `index.html` — UNTESTED.** Its own commit, no test
    impact, revertable on its own — the `pre.emoji { line-height: 1.2 }`
    precedent.

    ```css
    canvas.pixel {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      image-rendering: pixelated;
    }
    canvas.pixel-background {
      z-index: 0;
    }
    canvas.pixel-sprites {
      z-index: 1;
    }
    ```

    Every line is load-bearing, not decoration. Without `image-rendering:
pixelated` the browser bilinearly smooths the upscale and the 8-bit look
    dies. Without `position: fixed` the canvas sits inside the body's 1rem
    padding and below two paragraphs of text. The two `z-index` values order
    the planes without `-1`, which would put a canvas behind the opaque body
    background. The instruction paragraphs need `position: relative; z-index: 2`
    or they vanish under the sprite plane.
    **What proves it:** by eye in a browser. Vitest has no layout engine.

20. **doc-sync.** `docs/09_8bit_renderer.md` reconciled against what was built;
    `CLAUDE.md`'s Status paragraph (three renderers, the widened registry, the
    viewport-derived column count) and its `index.html` paragraph, which now
    lists a third load-bearing style rule. A third visibly different renderer is
    user-facing, so `README.md` and `CHANGELOG.md` get an entry too, the same
    reasoning `docs/07` cycle 14 gives.

**Payoff**: `?renderer=pixel` fills the window with a dark sky, a black
landform and a scatter of pixel stars, and pressing a key sends up a small
bright block trailing sparks that bursts into a round spray of chunky coloured
pixels, each fading through its own short tail, in sixteen colours and nothing
else.

---

## Verified toolchain facts

Checked against the installed toolchain, not recalled:

- **`noUncheckedIndexedAccess` applies to typed arrays.** `buffer[i]` is
  `number | undefined` for `Uint8Array` and `Float32Array`; writes are
  unaffected. Use `for (const [i, value] of buffer.entries())` in the per-pixel
  loops, which types `value` as `number`. Where an offset is not a loop cursor
  (`paintFrame` reading the brightness buffer), `?? -1` is correct and doubles
  as cycle 11's initial-value rule. `toRgba`'s palette lookup is the exception:
  a real throw, because an out-of-range index is a config error.
- **`new ImageData(pixels, w, h)` rejects a bare `Uint8ClampedArray`** under
  TS 6 — hence the explicit `<ArrayBuffer>` generic argument in cycles 16 and 17.
- **`ImageData` does not exist at runtime in node** but its type does, because
  tsconfig includes `"DOM"`. A test would typecheck and then throw. The port
  keeps it out.
- **`Uint8ClampedArray` rounds and clamps on assignment**, so `toRgba` needs no
  explicit `Math.round`.
- **`knip` counts same-file use**, so `PixelTarget` is safe the moment
  `createPixelRenderer`'s options type names it. It does **not** see config
  fields at all — growing `config.ts` one cycle at a time is this project's
  discipline, not a tool's.
- **The only `switch` is `indexFor`'s**, and `noImplicitReturns` plus a
  three-member union forces it complete in one cycle. No
  `no-unnecessary-condition` target exists in this plan.
- **`erasableSyntaxOnly` forbids an `enum`** for the palette. Plain numeric
  literals with comments.
- **`discCells` needs a bounding box** so it does not scan every pixel per
  sprite. This is the only place outside `cells.ts` that repeats the
  world-to-grid formula, and that is acceptable because it is a _bound_, not a
  mapping — correctness is decided entirely by the world-space distance test,
  so a too-wide box changes nothing observable. **Pad it by ±1 pixel**: every
  fixture is deliberately tie-free, so a too-narrow box would drop edge pixels
  no test catches.

---

## Out of scope

- **Reflowing on window resize.** The grid is sized at page load, like the
  backdrop seed. Resizing stretches the canvas until reload. Handling it means
  rebuilding the renderer and re-rasterising the background mid-session, which
  is a second feature.
- **Reusing the RGBA buffer between frames.** A fresh `Uint8ClampedArray` per
  frame is about 180 KB of garbage at 60 fps. The existing renderers build a
  whole new string grid each frame, so this is consistent with the project. If
  it janks, hoist one buffer out of the closure and overwrite it — one change,
  in one file.
- **`devicePixelRatio`.** Reading it inside `src/audiovisual/` is forbidden and
  reading it in `main.ts` would only make the buffer bigger for no visual gain:
  the pixels are meant to be visible.
- **Additive blending, glow, scanlines, dithering.** All real pixel-art
  techniques, none of them needed to land the look, and each one a change to a
  single function once the buffer exists.
- **A UI to switch renderers.** Still the URL, still `selectRenderer`.

---

## Verification

```bash
npx vitest run      # every cycle's tests green, no real timers, no DOM
npx tsc             # clean under strict
npx eslint .
npx prettier --check .
npx knip
npm run build       # still produces a working dist/
```

Invariant greps:

```bash
grep -rE "Math.random|Date.now|performance.now|location|innerWidth|devicePixelRatio" src/audiovisual/
# no calls. The pre-existing hit in webAudio.ts is a comment.

grep -rn "ImageData\|getContext\|document\." src/audiovisual/
# no calls. pixel.ts's own hits are its doc comments explaining the port,
# same as webAudio.ts's Math.random hit above; the real calls live only
# in main.ts.
```

Manual, in `npm run dev`:

- `?renderer=ascii`, `?renderer=emoji`, no parameter, and `?renderer=nonsense`
  all still work exactly as before. The widened registry is the riskiest part
  of cycle 18 and this is what catches a regression in it.
- `?renderer=pixel` fills the whole window — no scrollbars, no margin, no gap
  at any edge.
- **A `ring` firework's burst reads round, not oval.** Resize the window wide
  and narrow, reloading each time, and check it stays round in both. This is
  the whole point of deriving `worldHalfWidth` from the grid shape, and vitest
  cannot see it.
- **The pixels are hard-edged, not blurred.** Zoom in. If the blocks have soft
  borders, one of `image-rendering: pixelated` or `imageSmoothingEnabled =
false` is missing.
- **The background never flickers or repaints.** The sky and landform stay
  perfectly still while fireworks play over them. A flicker means the
  background plane is being repainted inside the frame closure.
- **A finished burst leaves nothing behind.** No stray coloured pixels once
  everything has faded — the `trail[0] === blank` rule working.
- **Sparks are visible at all.** If only shells render, cycle 8's sub-pixel
  rule is broken.
- **Trails taper and fading sparks shrink**, rather than reading as a chain of
  same-size blobs — cycle 12's radius scaling working.
- Raise `backdrop.skyMaxBrightness` to `1` and reload: the sky reaches the
  upper palette entries instead of stopping at index 1.
- Mash keys. Check nothing tears, drops frames badly, or leaves debris.

Then play test it and write what happened into `PLAY_TESTING.md` — `5m` and
`8f` have not tried `?sound=silly` yet either.

---

## Explicitly not in this plan

No change to `Renderer`, `Frame`, `Sprite`, `Backdrop` or anything else in
`src/audiovisual/types.ts`. No change to `cells.ts`, `backdrop.ts`, `frame.ts`
or `sparks.ts`. No change to how `?renderer=` is looked up. No WebGL, no sprite
sheets, no image files, no animation beyond what the simulation already
produces. The pixel renderer is a third entry in an existing table, drawing an
existing display list, and the fact that it needs no new shared contract is the
evidence that the seam was already in the right place.

# Fireworks game — emoji renderer build plan (v1)

See `01_intent.md` for the overall vision, `05_audio_visual_layer.md` for the AudioVisual layer this
plan extends, and `06_world_backdrop.md` for the backdrop this plan gives a second face. Those two
documents stay closed as their own v1 records; this one starts its cycles again at 1.

This document assumes no background in text rendering or colour theory. Where a decision needs a
concept explained, the explanation is here in full.

**Out of scope here**: a UI to switch renderers, running two renderers at once, and any renderer beyond
ASCII and emoji.

## Why a second renderer

`Sprite` carries `kind` and `color`. `rasteriseFrame` reads neither: it only reads `position` and
`brightness`, because a character has no colour to give it. That is not a bug — a character grid cannot
show hue — but it means two of `Sprite`'s four fields exist for a renderer that has not been written
yet.

Emoji have colour built in. A renderer that picks a coloured circle per spark, keyed on `sprite.color`,
shows a fact the ASCII renderer structurally cannot: a red firework bursts into red circles, a green one
into green. That is the reason this renderer exists.

## Why the emoji renderer is not just the ASCII renderer with different characters

Two of the ASCII path's own functions cannot be reused, and the reason is the same reason twice: an
emoji is not one character.

`rampChar(brightness, ramp)` and `overlayGrid(base, over)` both work in JavaScript string indices —
`ramp[index]`, `base[i]`, `over[i]`. A JavaScript string index is a UTF-16 code unit, and every emoji in
this plan's default palette is two or more code units (a surrogate pair; some, like flags, are more). So
`ramp[index]` on an emoji ramp reads half a glyph, and `base[i]` walking an emoji grid desynchronises
from `over[i]` after the first one. Neither function is wrong for what it does today. Neither is usable
unchanged for a grid of emoji.

The fix is to stop treating a grid as one string and start treating it as an array of cell strings,
joined only once, at the very end, when nothing will index into the joined result again. Every emoji
function in this plan is written that way: `readonly string[][]`, never `string`.

The second difference is width. A monospace character is one cell wide by definition — that is what
"monospace" means. An emoji is not: in a `<pre>` it renders at roughly twice a character's advance
width, but "roughly" is doing real work — the exact ratio depends on the font, and it is not something
`vitest` can measure. Three consequences follow, all decisions below: a blank cell has to be an emoji
too, not a space, because a space and an emoji are different widths and mixing them shears every column
after the first one; the grid needs fewer columns than the ASCII one to cover the same screen width; and
whether the columns actually line up is a fact only a browser can tell you.

## Decisions

1. **Every cell holds exactly one emoji, including the blank one.** The default blank is `⬛`, a
   black square, invisible against the page's `#05060a` background and exactly one emoji wide.
   Alignment then holds by construction — every cell is the same kind of thing — rather than by hoping
   a font renders a space and an emoji at the same width.
2. **Grids are `readonly string[][]`, not `string`, until the moment they are written to the DOM.**
   Decision driven by the UTF-16 problem above. No function in this plan indexes into an emoji string.
3. **Hue picks the spark glyph. Brightness picks the trail glyph. The shell is one fixed glyph.**
   `Sprite.color` is the fact ASCII discards, so sparks are where this renderer earns its keep: the
   nearest coloured circle to the sprite's hue. A trail still has to read as fading, and an emoji cannot
   dim the way a ramp character can — there is no in-between state for `🔴` — so a trail's glyph comes
   from `brightness` through a short ramp of its own, the same idea as `rampChar` applied to glyphs
   instead of characters. A shell is one thing throughout its flight, so it gets one glyph regardless of
   anything.
4. **The grid is 40 columns by 40 rows.** The ASCII grid is 80 by 40. Halving the columns roughly
   matches an emoji's roughly-double width, so the emoji grid covers about the same screen area. Equal
   columns and rows is what keeps the world square on screen — the world itself is 100 by 100, and a
   grid with more columns than rows would stretch it sideways, the same reasoning `06_world_backdrop.md`
   used for the ASCII grid's own 80-by-40 shape relative to its roughly 1:2 character cells. Getting an
   emoji cell back to square is a CSS `line-height` rule — see "The white page, again" below.
5. **The emoji renderer gets its own backdrop adapter, sharing the same core.** An ASCII backdrop
   composited under an emoji foreground would put single-width characters and double-width emoji in the
   same grid, which is exactly the shearing decision 1 exists to prevent. And `Backdrop | null` on the
   renderer's options would be a lie if the emoji renderer accepted one and drew nothing with it. The
   core this reuses without any change — `buildBackdrop`, `skyBrightnessAt`, `groundHeightAt` — is
   exactly what `06_world_backdrop.md`'s split was for: a second renderer reading the same seed and
   agreeing about the sky, without a second copy of what decides where anything is.
6. **A renderer is chosen from a registry by name, `?renderer=<name>` in the URL, ASCII by default.**
   Not a two-value choice with a two-value answer (a boolean, a ternary) — the point of building a
   second renderer is that this project now has more than one, and the mechanism that picks between
   them should not need rewriting for a third. The choice is a lookup in a table of named factories.
   Reading the URL is ambient browser state, so it stays in `src/main.ts`, the one file already trusted
   with `Date.now()` and `Math.random()`. The lookup rule itself — what happens on an unknown name, what
   happens on none at all — is `selectRenderer`, a small tested function, so that behaviour does not
   live only in the one file this project does not unit test.
7. **Its own document.** `06_world_backdrop.md` stays closed as its record; this file's cycles start
   again at 1.

## The shared seam: `contestCells`

`rasteriseFrame` currently does two jobs in one function: deciding **which sprite wins each cell** when
more than one lands there, and deciding **what character represents the winner**. The first job is
identical for any renderer working in world-to-grid cells; the second is ASCII-specific. The emoji
renderer needs the first job and a different answer to the second, so the first job is extracted into a
new, shared file.

```ts
// adapters/cells.ts — geometry and the cell contest; no character or glyph anywhere in this file
function toCell(
  x: number,
  y: number,
  grid: { readonly columns: number; readonly rows: number },
): { readonly row: number; readonly column: number } | null;

function rowCentreY(row: number, rows: number): number;
function columnCentreX(column: number, columns: number): number;

function contestCells(
  frame: Frame,
  grid: { readonly columns: number; readonly rows: number },
): readonly (Sprite | null)[][];
```

`toCell` moves here from `asciiGrid.ts` unchanged. `rowCentreY` and `columnCentreX` move here from
`asciiBackdrop.ts`, where they were private functions doing the inverse mapping for the backdrop's own
sampling — both renderers' backdrops need exactly that inverse, so it stops being private.

The grid parameter widens from `AudioVisualConfig["ascii"]` to the inline shape
`{ columns: number; rows: number }`. `AudioVisualConfig["ascii"]` is still assignable to it — it has
those two fields and more — and so will `AudioVisualConfig["emoji"]` once it exists. No call site that
already passes `config.ascii` needs to change, and no new named type lands for `knip` to flag as unused,
the same reasoning `06_world_backdrop.md` gave for `toCell`'s own inline return type.

`contestCells` is the one genuinely new piece of logic. It returns the **winning `Sprite` itself** per
cell, not a character — the character or glyph is a decision each adapter makes afterward, once it has
the sprite and can read its `kind` and `color`. The tie-break is unchanged from what `rasteriseFrame`
already does: on equal brightness, the sprite that arrived first in `frame.sprites` keeps the cell. A
strictly brighter later sprite always wins. This is not a free choice — `06_world_backdrop.md` explains
why the same rule mattered for a backdrop drawn as sprites, and preserving it here is what keeps
`rasteriseFrame`'s existing behaviour, and its four existing tests, intact.

`rasteriseFrame` is then rewritten as `contestCells` followed by `rampChar` on each winning sprite's
brightness — nothing about its signature or its output changes. **Its four existing tests passing
unchanged is the proof the extraction is faithful**, exactly the argument `06_world_backdrop.md` made
when it extracted `toCell` the same way.

## The concepts, explained

### Hue, and why the wraparound matters

**Hue** is where a colour sits on the colour wheel, expressed as an angle from 0° to 360°: 0° is red,
120° is green, 240° is blue, and 360° loops back to red. `hueOf(color)` derives this from an `Rgb`.

The wheel wraps, and a naive "nearest" comparison that does not account for the wrap gets red wrong.
Deep red sits near hue 350°, one step from hue 0°'s pure red — but a plain `Math.abs(a - b)` sees 350
and 0 as 350 degrees apart, the two colours the comparison thinks are most different are actually
neighbours. `sparkGlyph`'s nearest-hue search has to measure the short way around the circle, which is
why cycle 3's test drives it with a hue past 340° rather than trusting a hue near the middle of the
range to prove the point.

**Saturation** is how far a colour sits from grey, 0 to 1. A colour below `saturationFloor` (default
`0.15`) is treated as having no meaningful hue at all — hue is undefined at zero saturation in the same
sense a compass has no reading at the poles — and gets `emoji.desaturated` instead of a hue match.

### Why a trail's glyph ramp has to end on the blank

`06_world_backdrop.md` states one invariant as load-bearing: `ascii.ramp[0]` must be a space, because
that is what lets a decayed trail — brightness near zero, mapped to the ramp's dimmest character —
disappear into nothing, and it is what lets `overlayGrid` show the sky through it rather than punching a
visible hole.

The emoji renderer needs the identical invariant, restated for glyphs: `emoji.trail[0]` must equal
`emoji.blank`. `contestCells` returns the winning sprite regardless of how dim it is — brightness only
decides _which_ sprite wins a cell, never _whether_ the winner draws something. If a trail's dimmest
glyph were `💫` instead of `⬛`, a fully decayed trail would still win its cell and would still draw a
visible, opaque `💫` — a persistent bright dot marking every burst's fading tail long after the ASCII
renderer would have shown nothing there at all. No other glyph in `emoji.trail` may equal `emoji.blank`,
or that glyph's sprite would be invisible instead of merely dim.

### The white page, again

`06_world_backdrop.md`'s "The white page" section explains why `index.html` carries a dark background
and `line-height: 1`: without it, the brightness ramp reads inverted. Emoji add a second, unrelated
reason to touch `line-height`, this time on a class scoped to the emoji `<pre>` alone.

A monospace character cell in this project's font is roughly twice as tall as it is wide — that is what
makes an 80-column, 40-row grid read as close to square. An emoji cell at the same `line-height: 1` is
close to square on its own already — width and height are closer to equal — so composing a 40-by-40
emoji grid at `line-height: 1` comes out taller than it is wide: the world stretches vertically. Cycle
13's `pre.emoji { line-height: 1.2; }` compresses the row spacing back down until the cell is square
again. This is tuned by eye against the running page, not derived from a formula — there is no
`vitest` test that can see a rendered glyph's pixel dimensions, so this rule is verified by loading a
`ring` firework and confirming its burst reads round rather than oval.

## Key contracts

```ts
// color.ts — colour facts, not glyphs, so they stay in the core, usable by any future renderer
function hueOf(color: Rgb): number; // 0..360; 0 when the colour is grey
function saturationOf(color: Rgb): number; // 0..1

// adapters/cells.ts — shared geometry, no character or glyph
function toCell(
  x: number,
  y: number,
  grid: { readonly columns: number; readonly rows: number },
): { readonly row: number; readonly column: number } | null;
function rowCentreY(row: number, rows: number): number;
function columnCentreX(column: number, columns: number): number;
function contestCells(
  frame: Frame,
  grid: { readonly columns: number; readonly rows: number },
): readonly (Sprite | null)[][];

// adapters/emojiGrid.ts
function rampGlyph(brightness: number, glyphs: readonly string[]): string;
function sparkGlyph(color: Rgb, emoji: AudioVisualConfig["emoji"]): string;
function glyphFor(sprite: Sprite, emoji: AudioVisualConfig["emoji"]): string;
function rasteriseEmojiFrame(
  frame: Frame,
  emoji: AudioVisualConfig["emoji"],
): readonly string[][];
function overlayEmojiGrid(
  base: readonly string[][],
  over: readonly string[][],
  blank: string,
): readonly string[][];

// adapters/emojiBackdrop.ts
function rasteriseEmojiBackdrop(
  backdrop: Backdrop,
  emoji: AudioVisualConfig["emoji"],
): readonly string[][];

// adapters/emoji.ts
function createEmojiRenderer(options: {
  readonly target: TextTarget;
  readonly config: AudioVisualConfig;
  readonly backdrop: Backdrop | null;
}): Renderer;

// selectRenderer.ts
function selectRenderer<T>(
  requested: string | null,
  renderers: Readonly<Record<string, T>>,
  fallback: string,
): { readonly name: string; readonly create: T };
```

`TextTarget` is imported from `adapters/ascii.ts`, not redeclared — one port, both renderers.

`rasteriseEmojiBackdrop` takes only `AudioVisualConfig["emoji"]`, not the whole config, unlike
`rasteriseBackdrop`. `rasteriseBackdrop` needs `config.backdrop.groundFillBrightness` to pick a ramp
character for the ground's fill; the emoji ground has one fixed glyph and no brightness to look up, so
there is no second slice of config to reach for.

`overlayEmojiGrid` takes `blank` as an explicit parameter rather than reading it off config, the same
reason `06_world_backdrop.md`'s decision 6 gives for keeping glyphs in config at all: a test can drive
an unusual blank value, and a hardcoded `"⬛"` inside the function would fail it.

`selectRenderer` is generic in `T` and imports nothing from the DOM or from either adapter. It answers
one question — given what was asked for and what exists, which one runs, and what is its name — and
nothing about how a renderer is built.

## Config

```ts
readonly emoji: {
  readonly columns: number;  // 40
  readonly rows: number;     // 40
  readonly blank: string;    // "⬛"
  readonly shell: string;    // "🚀"
  readonly trail: readonly string[]; // faded -> bright, trail[0] === blank: ["⬛", "💫", "✨"]
  readonly sparkHues: readonly { readonly hue: number; readonly glyph: string }[];
  readonly desaturated: string;     // "⚪" — below the floor, hue is meaningless
  readonly saturationFloor: number; // 0.15
  readonly sky: readonly string[];  // dim -> bright
  readonly backdropGlyphs: {
    readonly star: string;   // "⭐"
    readonly moon: string;   // "🌙"
    readonly planet: string; // "🪐"
    readonly ridge: string;  // "🌲"
    readonly ground: string; // "🟫"
  };
};
```

Defaults:

- `sparkHues`: `🔴 0`, `🟠 30`, `🟡 55`, `🟢 130`, `🔵 200`, `🟣 280`, `🌸 330`. Chosen to cover the
  three palettes `defaultActionConfig.palettes` already defines: the warm palette's reds, oranges and
  yellows land close to `0`–`55`; the cool palette's greens, teals and blues land close to `130`–`200`;
  the purple-and-pink palette lands close to `280`–`330`. A single burst draws from one palette, so it
  reads as a mix of two or three neighbouring circles, not one flat colour and not every colour at once.
- `sky`: `["⬛", "🌌", "🟦", "🟪", "🟧"]`. With the default `skyMaxBrightness` of `0.25` and five
  levels, `Math.round(0.25 * 4)` is `1`, so a default-configured sky's brightest point reaches `🌌` and
  its dimmest is `⬛`. `🟦`, `🟪` and `🟧` are reachable only by raising the cap — the same banding
  `06_world_backdrop.md` documents for the ASCII ramp, for the identical reason: few levels, capped low.
- `backdropGlyphs` keeps the same three keys `CelestialBody["kind"]` already has — `star`, `moon`,
  `planet` — so `emoji.backdropGlyphs[body.kind]` type-checks exactly the way
  `ascii.backdropGlyphs[body.kind]` does today, plus `ridge` and `ground` for the two-part landform.

Frozen with `Object.freeze` at every level — the array, each entry object in `sparkHues`, `trail`,
`sky`, and `backdropGlyphs` — the same discipline `06_world_backdrop.md` states for its own config:
there is no `deepFreeze` helper in this project, and a level left unfrozen is invisible until something
mutates it at runtime.

### Glyph house rules

Two rules, both checkable by inspection or by `grep`, the same spirit as `06_world_backdrop.md`'s glyph
house rule for the core.

1. **Every glyph renders as an emoji without a variation selector.** No `U+FE0F` sequences, no
   zero-width-joiner sequences, no skin-tone modifiers. These vary in rendered width between fonts and
   platforms in a way a single fixed-width emoji does not, and a width that varies shears the grid —
   exactly the failure decision 1 exists to prevent.
2. **`emoji.trail[0]` must equal `emoji.blank`, and no other glyph in this config may.** Restated in
   full above, under "Why a trail's glyph ramp has to end on the blank."

## Selecting a renderer

```ts
export function selectRenderer<T>(
  requested: string | null,
  renderers: Readonly<Record<string, T>>,
  fallback: string,
): { readonly name: string; readonly create: T };
```

Four rules, one test each:

- a name present in `renderers` returns that entry, under its own name;
- a name absent from `renderers` returns the `fallback` entry, under the **fallback's** name — not the
  requested one. The name doubles as the `<pre>`'s CSS class in `main.ts`, so if the renderer falls
  back, the class has to fall back with it; returning the requested name here would style the page for
  a renderer that never actually ran.
- `requested === null` (no `?renderer=` in the URL at all) returns the fallback, the same as an unknown
  name;
- a `fallback` string missing from `renderers` throws. That is a call-site bug — a program passed
  `"ascii"` as its fallback while forgetting to register `"ascii"` — not a case to recover from
  silently. This project states that kind of contract violation with an explicit `throw new Error(...)`
  rather than a non-null assertion; see `rampChar` and `frame.ts`'s `firstColor` for the standing
  pattern. It is also what satisfies `noUncheckedIndexedAccess`, which types every `Record` lookup as
  possibly `undefined` regardless of what a reader can see is actually guaranteed.

## Wiring

```ts
// src/main.ts
const renderers: Record<string, (target: TextTarget) => Renderer> = {
  ascii: (target) =>
    createAsciiRenderer({ target, config: defaultAudioVisualConfig, backdrop }),
  emoji: (target) =>
    createEmojiRenderer({ target, config: defaultAudioVisualConfig, backdrop }),
};

const { name, create } = selectRenderer(
  new URLSearchParams(location.search).get("renderer"),
  renderers,
  "ascii",
);
grid.className = name;
const renderer = create(grid);
```

Every registry entry is a closure over `defaultAudioVisualConfig` and `backdrop`, taking only the
`target` — that is what lets the table's value type stay one signature,
`(target: TextTarget) => Renderer`, while `createAsciiRenderer` and `createEmojiRenderer` behind it keep
whatever options they each actually need. Adding a third renderer later is one more entry in this table
and nothing else in this file.

`location` joins `Date.now()` and `Math.random()` as ambient browser state this project only reads in
`src/main.ts`. `grep -rE "Math.random|Date.now|performance.now|location" src/audiovisual/` must keep
returning nothing.

`index.html` gains one rule, keyed on the class the registry set:

```css
pre.emoji {
  line-height: 1.2;
}
```

## File layout

```
src/audiovisual/
  color.ts               + hueOf, saturationOf                          [pure]
  config.ts               + emoji key
  selectRenderer.ts       selectRenderer                                [pure]
  adapters/
    cells.ts             toCell, rowCentreY, columnCentreX,
                          contestCells                                  [pure]
    asciiGrid.ts          rasteriseFrame rewritten onto contestCells;
                          rampChar unchanged; toCell now imported
    asciiBackdrop.ts      rowCentreY/columnCentreX now imported, not
                          private; rasteriseBackdrop, overlayGrid unchanged
    emojiGrid.ts          rampGlyph, sparkGlyph, glyphFor,
                          rasteriseEmojiFrame, overlayEmojiGrid          [pure]
    emojiBackdrop.ts      rasteriseEmojiBackdrop                        [pure]
    emoji.ts              createEmojiRenderer({ target, config, backdrop })
src/main.ts               + renderers registry, selectRenderer, grid.className
index.html                 + pre.emoji { line-height: 1.2; }
```

## TDD build cycles

Test-driven, same discipline as every layer and plan before it: write the failing test first, then the
minimum code to pass, one commit per cycle. Every cycle drives its assertion from an unusual config
value or a hand-made fixture, never a default, so a hardcoded implementation fails it.

**Before cycle 1 — done**: this file. `docs/05_audio_visual_layer.md`'s stale `createAsciiRenderer`
signature corrected. `src/audiovisual/adapters/cells.ts`, `emojiGrid.ts`, `emojiBackdrop.ts`, `emoji.ts`
and `src/audiovisual/selectRenderer.ts` do not exist. The AudioVisual layer and the world backdrop are
both complete and green.

### Pass A — the shared seam

1. **`contestCells` in `adapters/cells.ts`.** A frame with two sprites landing in one cell asserts the
   returned grid holds the winning **sprite itself**, `kind` and `color` intact — an implementation that
   returns characters cannot pass this. Two tie-break cases, because the rule has two halves: a strictly
   brighter later sprite takes the cell, and an equally bright later sprite does not, so the earlier one
   keeps it. Plus: a sprite outside the grid is absent from the result, not wrapped to an edge; an empty
   cell is `null`. `toCell` moves in from `asciiGrid.ts`; `rowCentreY` and `columnCentreX` move in from
   `asciiBackdrop.ts` and stop being private. `rasteriseFrame` and `rasteriseBackdrop` are rewritten onto
   the moved functions. **No existing test in either file changes.**

### Pass B — colour becomes a glyph

2. **`hueOf` and `saturationOf` in `color.ts`.** Hand-made values, checkable by eye: pure red is hue 0,
   pure green 120, pure blue 240; a grey has saturation 0 and pure red has saturation 1; a grey's hue is
   0, not `NaN` — the division this arithmetic invites at zero saturation, guarded rather than left to
   surface as a silent `NaN` three functions downstream.
3. **`sparkGlyph` in `adapters/emojiGrid.ts`, and the `emoji` config key.** Unusual table
   `[{ hue: 10, glyph: "A" }, { hue: 200, glyph: "B" }]`, so the real default table cannot pass. The
   load-bearing case: a colour at hue 350 picks `"A"`, not `"B"` — the wraparound "Hue, and why the
   wraparound matters" describes above; a plain absolute-difference comparison picks `"B"` and fails.
   Plus: a colour below `saturationFloor` returns `desaturated` regardless of its hue, and a colour just
   above the floor does not. This cycle is also where `AudioVisualConfig.emoji` is introduced, since
   this is the first function that needs it.
4. **`rampGlyph` and `glyphFor`.** `rampGlyph` mirrors `rampChar`, over an array instead of a string:
   clamped to `[0, 1]`, rounded to the nearest index, dimmest first. Asserted on an unusual three-entry
   list, including that brightness `0` returns the **first** entry — the one a two-entry list could not
   distinguish from an off-by-one, which is why the fixture needs three. `glyphFor` dispatches on
   `sprite.kind`: `"shell"` always returns `emoji.shell`, whatever the sprite's colour;
   `"spark"` returns `sparkGlyph`'s answer; `"trail"` returns `rampGlyph` over `emoji.trail`, so a
   trail's colour never enters the decision, only its brightness.
5. **`rasteriseEmojiFrame`.** A 3-by-2 grid with an unusual glyph set, asserted as the complete
   `readonly string[][]`. Cells nothing lands in hold `emoji.blank`. One sprite in the top row and one
   in the bottom proves the `y` flip and `x` centring `contestCells` already handles survive being
   called with the `emoji` slice of config instead of `ascii`.
6. **`overlayEmojiGrid`.** Base `[["a","b"],["c","d"]]` under foreground `[["X","-"],["-","Y"]]` with
   `blank: "-"` gives `[["X","b"],["c","Y"]]`. A second case names the trap directly, the emoji-grid
   counterpart of `overlayGrid`'s own second case: a blank cell over a blank cell stays blank, and the
   row and column counts of the result never differ from the inputs', so the two grids cannot drift
   apart in shape.

### Pass C — the emoji sky

7. **`rasteriseEmojiBackdrop` — the sky.** Unusual fixture
   `{ columns: 3, rows: 2, sky: ["p", "q", "r", "s", "t"] }`, an uncapped sky
   `{ horizon: 1, zenith: 0 }` (capping is `buildSky`'s job, not this adapter's), and a flat ground at
   height `0` so it draws nothing yet. Row centres at `y = 75` and `y = 25` give brightnesses `0.25` and
   `0.75`, so the result is `[["q","q","q"],["s","s","s"]]` — a fixture chosen to avoid a `.5` rounding
   tie, the same reasoning `06_world_backdrop.md`'s cycle 8 gives for its own sky fixture. The sky must
   fill **every** cell in this pass, before bodies or ground exist to paint over any of it — this is the
   contract `overlayEmojiGrid` leans on in cycle 6: it has no fallback for a base cell that is missing,
   because a correctly built backdrop never has one.
8. **`rasteriseEmojiBackdrop` — bodies.** Unusual glyphs `{ star: "S", moon: "M", planet: "P" }`. Bodies
   place through the shared `toCell` from `adapters/cells.ts`, the same mapping sparks use, so a body
   and a spark at one world point land in the same cell. A star placed at the moon's own position
   asserts `"M"` wins — paint order doing the work of an overlap test, the same as the ASCII backdrop. A
   body placed outside the grid asserts it is clipped, not wrapped.
9. **`rasteriseEmojiBackdrop` — ridge and fill.** A cell is ground when its row centre's `y` is at or
   below `groundHeightAt` at its column centre's `x`. The topmost ground cell in a column gets
   `backdropGlyphs.ridge`; every cell below it gets `backdropGlyphs.ground`. Fixture: 4 columns, 4 rows,
   a black sky, and a ground sloping from height `15` at `x = -50` to `100` at `x = 50` — a slope chosen
   to give a tie-free diagonal staircase, avoiding two columns landing on the same row. A second case
   places a star inside the landform and asserts the ground covers it, because ground paints last.

### Pass D — the renderer, the choice, and the page

10. **`createEmojiRenderer` in `adapters/emoji.ts`.** Two cases, mirroring `ascii.test.ts`'s own two.
    With `backdrop: null`, the target receives one write per call, equal to `rasteriseEmojiFrame`'s
    result joined — each row's cells joined with `""`, the rows joined with `"\n"`. With a backdrop
    given, the write equals the same join applied to
    `overlayEmojiGrid(rasteriseEmojiBackdrop(backdrop, config.emoji), rasteriseEmojiFrame(frame, config.emoji), config.emoji.blank)`
    — the actual composition, driven with unusual `columns` and `rows` so a hardcoded grid size cannot
    pass.
11. **`selectRenderer`.** Unusual table `{ a: 1, b: 2 }`, fallback `"a"`. Requesting `"b"` returns
    `{ name: "b", create: 2 }`. Requesting `"zzz"` and requesting `null` both return
    `{ name: "a", create: 1 }` — the name falling back together with the factory is the assertion that
    matters, since a version that returned the requested name alongside the fallback factory would style
    the page for a renderer that is not the one running. A fallback of `"missing"`, absent from the
    table, throws.
12. **Wire `src/main.ts`.** The `renderers` registry, the `URLSearchParams` read, the `selectRenderer`
    call, `grid.className`. Not unit tested, like the rest of this file — proven by loading the page
    with and without `?renderer=emoji` in a real browser. This file now holds only the registry itself
    and the four lines that read it; the rule for what happens on an unknown or missing name is tested
    in cycle 11, not sitting untested here.
13. **The emoji `line-height` rule** in `index.html`. `pre.emoji { line-height: 1.2; }`, beside the
    existing `pre` rule from `06_world_backdrop.md`'s cycle 14. Its own commit, no test impact,
    revertable on its own if the ratio needs retuning.
14. **doc-sync.** This file reconciled against what was actually built, `README.md`'s status paragraph,
    `CLAUDE.md`'s status paragraph, and `CHANGELOG.md`. A second, visibly different renderer is a
    user-facing change — the same reasoning `06_world_backdrop.md`'s cycle 15 gives for why that plan's
    own doc-sync pass warranted a changelog entry where every plan before it did not.

**Payoff**: `http://localhost:5174/` behaves exactly as before. `http://localhost:5174/?renderer=emoji`
loads the same simulation into an emoji sky — stars, a moon, a planet, a treeline — and pressing a key
sends up a `🚀` that bursts into a coloured spread of circles, each one fading out through a short trail
before it disappears completely, the colour matching whichever palette that key's firework drew from.

## Critical files

| Path                                        | Purpose                                        |
| ------------------------------------------- | ---------------------------------------------- |
| `docs/07_emoji_renderer.md`                 | This file, written before cycle 1              |
| `src/audiovisual/adapters/cells.ts`         | Cycle 1 — the shared seam                      |
| `src/audiovisual/adapters/asciiGrid.ts`     | Cycle 1 — `rasteriseFrame` rewritten onto it   |
| `src/audiovisual/adapters/asciiBackdrop.ts` | Cycle 1 — geometry imported, no longer private |
| `src/audiovisual/color.ts`                  | Cycle 2 — `hueOf`, `saturationOf`              |
| `src/audiovisual/config.ts`                 | Cycle 3 — the `emoji` key                      |
| `src/audiovisual/adapters/emojiGrid.ts`     | Cycles 3–6                                     |
| `src/audiovisual/adapters/emojiBackdrop.ts` | Cycles 7–9                                     |
| `src/audiovisual/adapters/emoji.ts`         | Cycle 10                                       |
| `src/audiovisual/selectRenderer.ts`         | Cycle 11 — the lookup rule                     |
| `src/main.ts`                               | Cycle 12 — the registry and the URL read       |
| `index.html`                                | Cycle 13 — `pre.emoji`                         |

## Out of scope

- **Switching renderer without a reload.** `?renderer=` is read once, at startup. A live toggle is a
  UI feature this plan does not build.
- **A renderer needing anything other than a `<pre>`.** The registry's value type,
  `(target: TextTarget) => Renderer`, covers any number of renderers that all draw into the same kind
  of element. A Canvas or WebGL2 renderer needs a different element entirely, and that is a change to
  the registry's value type when it happens, not something this plan pre-builds for.
- **Listing available renderers on the page.** The registry's own keys would supply this for free; no
  UI reads them.
- **Running two renderers at once.** `createAudioVisualLayer` takes exactly one `Renderer`, and it owns
  a `createPhaseWatcher` — two layers running side by side would each watch the same phase transitions
  and each fire the same sound cues, doubling every launch, flight and burst sound.
- **Sound.** Nothing about `AudioSink`, `Voice`, or how a firework sounds changes in this plan.
- **A dim-and-bright pair per hue.** Sparks in this plan use hue alone, one glyph per hue family. Adding
  a brightness tier per hue means a second glyph for every entry in `sparkHues`, and not every hue this
  project needs has an obvious dim partner in the emoji set.
- **Reacting to a resized window**, the same as the ASCII grid: `emoji.columns` and `emoji.rows` are
  fixed config, read once at construction.

## Verification

- `npx vitest run` — every cycle's tests green, no real timers.
- `npx tsc` — clean under `strict`.
- `npx eslint .`, `npx prettier --check .`, `npx knip` — clean before each commit; the pre-commit hook
  enforces it.
- `npm run build` — still produces a working `dist/`.
- `grep -rE "Math.random|Date.now|performance.now|location" src/audiovisual/` — no calls. The URL read
  lives in `src/main.ts` only, alongside the existing seed generation. The one pre-existing hit in
  `webAudio.ts` is a comment, not a call.
- `grep -n '"🔴"\|"⬛"\|"🚀"' src/audiovisual/backdrop.ts src/audiovisual/frame.ts` — no hits. The core
  names no glyph, the same house rule `06_world_backdrop.md` states for characters; `config.ts` holding
  the defaults is the declared exception, not a violation.
- Manual, in `npm run dev`:
  - `http://localhost:5174/` — the ASCII grid, unchanged from before this plan. This is the regression
    check that Pass A's extraction of `contestCells` changed nothing observable.
  - `http://localhost:5174/?renderer=emoji` — an emoji sky: a scatter of stars, a moon, a planet, a
    treeline along the bottom. Press a key: `🚀` climbs, then bursts into coloured circles that fade
    out through the trail glyphs before vanishing.
  - `http://localhost:5174/?renderer=nonsense` — falls back to the ASCII grid, no crash, and the
    `<pre>`'s class reads `ascii`, not `nonsense`.
  - **Columns line up.** Every row is the same width, top to bottom, with no visible shear. This cannot
    be unit tested — `vitest` has no font metrics — so it is the one check that decides whether the
    chosen glyph set is actually usable, done by eye in a real browser.
  - **A `ring` firework's burst reads round, not oval.** The check that 40-by-40 at `line-height: 1.2`
    actually squares the cell. An ellipse means `line-height` needs retuning.
  - **A finished burst leaves nothing behind.** Watch one burst fade all the way out, then look at the
    sky where it was: stars and sky glyphs, no leftover `💫`. This is the trail-blank house rule
    working.
  - Press the same key repeatedly: the burst colour stays within one family, since a key's palette is
    stable across presses. Press a different key: a different family, so visibly different circles.
  - Raise `backdrop.skyMaxBrightness` to `1` and reload: the sky reaches `🟦`, `🟪`, and `🟧`.

## Explicitly not in this plan

A UI to switch renderers, running more than one renderer at once, sound of any kind, a brightness tier
per hue, and reacting to a window resize. This plan draws the same simulation twice — once in
characters, once in emoji — chosen by one URL parameter read once at startup.

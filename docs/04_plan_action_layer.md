# Fireworks game — Action layer build plan (v1)

See `01_intent.md` for the overall vision and `02_spec.md` for the Control layer this plan builds on top
of. This document is the _how_ for the Action layer: file layout, contracts, a small physics simulation,
and an ordered list of test-driven build cycles.

**Out of scope here**: the `FireworkSpec` consumer (the AudioVisual layer). Nothing in this plan draws
anything — it produces simulated fireworks and a way to see their state as text, the same boundary
`03_plan_control_layer.md` drew for `ControlEvent`.

This document assumes no prior game-dev background. Where a decision is specific to this design, it's
explained; ordinary web-dev concepts are not.

## Why Action simulates, not just decides

An earlier version of this plan had Action emit a burst point — where a firework explodes — and stop
there, leaving the flight path from launch to burst for the renderer to invent. That puts a
gameplay-visible decision in the wrong layer: two renderers could draw the same spec taking different
paths, and `01_intent.md`'s rule ("AudioVisual never re-derives anything Action already decided") would
be broken by the first line of rendering code anyone wrote.

So Action runs a small physics simulation. It decides a firework's initial conditions once, at the key
press, then steps its position forward every frame under gravity, wind and thrust, the same way the whole
game already treats time: injected, deterministic, never read from a real clock inside logic under test.

## Decisions

1. **Action simulates. AudioVisual draws.** Action holds the live fireworks, steps them on a fixed
   timestep, and exposes a read-only snapshot. The renderer reads that snapshot and draws it. It never
   integrates motion, never decides where a burst lands.
2. **World parameters are separate from firework parameters.** Gravity, wind and drag live in a
   `WorldConfig` that applies to every object. Velocity, thrust, fuel and fuse are per-firework, seeded
   from the key.
3. **A spec and an entity are different objects.** `FireworkSpec` is the immutable recipe decided at key
   press — the object that would travel to another player later, once multiplayer exists. `Firework` is
   the mutable live state. One is built from the other and they never merge.
4. **Sequences are out of scope.** No pattern matching, no reading of Control's history.
   `resolveAction` returns a list of specs, one today — a chord or a sequence-triggered special firework
   later appends to that list rather than reshaping it. That list is the whole placeholder for "special
   actions": there is no `special` field sitting unused on `FireworkSpec` waiting for a future cycle,
   because an always-empty field is exactly the kind of untested surface `CLAUDE.md`'s TDD rule bans.
5. **World space has `y` up, origin at bottom centre.** Not the browser's top-left, `y`-down convention —
   see "World space" below for why, and how the renderer converts one to the other.
6. **The entire spec is decided here**, sound included. Pitch and timbre, cycle 8. This follows from
   `01_intent.md` — sound follows each firework's sprite — and from the same rule as decision 1: a
   gameplay-audible choice belongs in Action, not in whatever plays it later.

## World space

Physics does not belong in percentages of a browser window. Gravity measured in "percent of viewport
height per second squared" changes when the window resizes, so the same firework would fly differently on
a phone and a monitor.

The simulation runs in its own fixed space, and the renderer maps that space to pixels:

- 100 units wide, 100 units tall.
- Origin at bottom centre: `x` runs `-50` to `50`, `y` runs `0` to `100`.
- **`y` grows up.** Gravity is `{ x: 0, y: -18, z: 0 }`, launch velocity is positive `y`. Every physics
  line then reads the way the formula does — "gravity pulls y down" means a negative y value, not a
  positive one subtracted somewhere else. The renderer flips it with one subtraction when converting to
  screen pixels, where it belongs: a rendering concern, not a physics one.
- `z` is carried on every vector and always `0` in v1, leaving room for depth later without reshaping
  anything.

## Key contracts

`types.ts` grows one cycle at a time, the same way `src/control/types.ts` did — knip flags an exported
type nothing imports yet as dead code, and the pre-commit hook runs knip, so this whole block does not
land in one commit. Each type's arrival cycle is in its own comment.

```ts
interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} // cycle 4

interface Seeds {
  readonly key: number; // stable per physical key
  readonly press: number; // varies per press
} // cycle 3

type FireworkPattern = "peony" | "willow" | "ring" | "chrysanthemum"; // cycle 6
type FireworkTimbre = "soft" | "sharp" | "crackle"; // cycle 8

interface FireworkSound {
  readonly pitch: number; // Hz
  readonly timbre: FireworkTimbre;
} // cycle 8

// The recipe. Decided once at key press, never changes. Everything a second
// machine would need to show the identical firework, once multiplayer exists.
interface FireworkSpec {
  readonly id: string; // deterministic, unique per press
  readonly launchedAt: number; // signal.timestamp
  readonly origin: Vec3; // world space
  readonly velocity: Vec3; // initial, world units per second
  readonly thrust: number; // acceleration along heading while fuel burns
  readonly fuelMs: number; // how long thrust lasts
  readonly fuseMs: number; // time from launch to burst
  readonly pattern: FireworkPattern;
  readonly colors: readonly string[];
  readonly particleCount: number;
  readonly burstDurationMs: number;
  readonly sound: FireworkSound;
  readonly seed: number; // AudioVisual's per-particle jitter only
} // cycle 9

type FireworkPhase =
  | "armed" // spawned, not yet moving
  | "launching" // leaving the ground, launch effects
  | "flying" // in the air, powered or ballistic
  | "exploding" // burst effects playing
  | "finished"; // ready to remove

// The live object. Built from a spec, changed every step, never sent
// anywhere — it stays inside the simulation.
interface Firework {
  readonly spec: FireworkSpec;
  readonly phase: FireworkPhase;
  readonly position: Vec3;
  readonly previousPosition: Vec3; // for render interpolation
  readonly velocity: Vec3;
  readonly fuelRemainingMs: number;
  readonly fuseRemainingMs: number;
  readonly phaseElapsedMs: number; // how long in the current phase
} // cycle 10
```

## Config

Two config objects, not one, for the same reason the data above splits in two: world values get retuned
once to change how everything feels, firework values vary per key press. Both stay separate from
`ControlConfig` — Action must never read `historyMaxEntries` or `deniedCodes`, the same rule that keeps
the keyboard adapter ignorant of Action's concerns.

```ts
interface NumberRange {
  readonly min: number;
  readonly max: number;
}

// Applies to every object in the world. Constants in v1 — see "Out of scope"
// below for why nothing here varies during play yet.
interface WorldConfig {
  readonly gravity: Vec3; // { x: 0, y: -18, z: 0 }
  readonly wind: Vec3; // { x: 1.5, y: 0, z: 0 }
  readonly drag: number; // 0 = none; velocity lost per second
  readonly stepMs: number; // fixed timestep, e.g. 1000 / 120
}

// How a key press becomes a recipe.
interface ActionConfig {
  readonly launchOrigin: Vec3; // { x: 0, y: 0, z: 0 }
  readonly launchSpeed: NumberRange;
  readonly launchAngle: NumberRange; // degrees from vertical, e.g. -25 to 25
  readonly thrust: NumberRange;
  readonly fuelMs: NumberRange;
  readonly fuseMs: NumberRange;
  readonly patterns: readonly FireworkPattern[];
  readonly palettes: readonly (readonly string[])[]; // colour families
  readonly paletteSize: number; // colours drawn per firework
  readonly particleCount: NumberRange;
  readonly burstDurationMs: NumberRange;
  readonly launchDurationMs: number; // armed -> launching -> flying
  readonly sound: {
    readonly pitch: NumberRange;
    readonly timbres: readonly FireworkTimbre[];
  };
}
```

`NumberRange`, not `Range` — the DOM library already defines a global `Range`, and shadowing it would
make that name ambiguous wherever it shows up in an error message.

## Seeded randomness

The hypothesis in `01_intent.md`: pressing the same key feels familiar without ever repeating. Two seeds,
both derived from the signal, no stored state:

1. **`key`** — `hashString(signal.id)`. The same physical key always gives the same number. This picks
   the **family**: the launch angle, which pattern, which colour palette, which pitch.
2. **`press`** — `hashString(signal.id + ":" + Math.floor(signal.timestamp))`. Different every press.
   This picks the **variation**: launch speed, thrust, fuel, fuse, which colours from the family, particle
   count, duration.

Requirements:

1. No `Math.random()` anywhere in `src/action/`.
2. No `Date.now()` or `performance.now()` anywhere in `src/action/`. Everything comes from the signal or
   from an injected `elapsedMs`.
3. Floor the timestamp before hashing it. `event.timeStamp` is a float; flooring stops two machines
   disagreeing over the last bits, which matters for the multiplayer seam even though multiplayer itself
   is not being built.
4. No module-level state. Two fresh layers fed the same events produce identical specs.

`hashString` is FNV-1a, 32-bit. `createRandom` is mulberry32. Both are short, well known, and fast — the
point is a repeatable sequence, not cryptographic quality.

## The state machine

```
armed --(launchDurationMs/2)--> launching --(launchDurationMs/2)--> flying
flying --(fuseRemainingMs <= 0)--> exploding
exploding --(burstDurationMs)--> finished --> removed from the world
```

Rules:

1. Each phase exists so AudioVisual has a distinct set of effects to draw later. They are not physics
   modes — physics runs the same integration in `launching`, `flying` and `exploding` regardless of which
   one is active.
2. **Fuel reaching zero is not a phase transition.** Thrust stops, the shell keeps flying, the arc becomes
   ballistic. It stays in `flying`. A rocket that runs out of fuel doesn't stop being a rocket in flight —
   it just stops being pushed.
3. The fuse runs from spawn and ignores every other timer, so a burst can happen during `launching` or
   while fuel still burns. This is what makes a short-fuse firework possible, and it is why fuse is a
   separate field from fuel rather than "burst when fuel runs out."
4. Gravity, wind and drag apply during `launching`, `flying` and `exploding`. Not during `armed`, which
   has not launched, and not during `finished`, which is gone.
5. `finished` is a phase, not a deletion. An entity enters it, the renderer gets one snapshot showing it,
   and the world removes it at the end of that step. A burst that vanished the instant its timer expired
   would give AudioVisual no frame in which to end the effect.

## Physics

Semi-implicit Euler, two lines per step:

```
velocity += acceleration * dt
position += velocity * dt
```

Not plain Euler, which updates position from the old velocity and visibly bleeds energy out of an arc —
a launched shell would rise less high each time you watched it, which is wrong in a way a player notices.
Not Verlet or RK4, which solve a stiffer problem than a projectile has: they cost more per step to buy
accuracy this simulation doesn't need. Semi-implicit is the standard choice for 2D game physics for
exactly this reason.

Acceleration each step is the sum of:

- `world.gravity`, always.
- `world.wind`, always.
- `-velocity * world.drag`, always. Drag opposes motion, so it falls out of the same sum rather than
  needing a branch.
- `heading * spec.thrust` while `fuelRemainingMs > 0`, where `heading` is the normalised initial velocity.
  A real rocket also loses mass as its fuel burns, so it accelerates harder over time; constant thrust is
  close enough for v1 and is one vector instead of a mass model.

### Fixed timestep

`world.step(elapsedMs)` accumulates real elapsed time and runs as many `stepMs`-sized steps as are due,
keeping the remainder for next time. It never integrates with a variable `dt`.

Three reasons, all of which matter here:

1. **Determinism.** The same inputs produce the same flight on a 60Hz laptop and a 144Hz monitor. That is
   the multiplayer seam `01_intent.md` reserves — two screens agreeing on one outcome from one input log
   only works if the simulation itself doesn't depend on how fast either screen renders.
2. **Stability.** A long frame — the tab was backgrounded, or the browser hitched — fed as one giant `dt`
   would make an object jump straight through the arc it should have travelled, sometimes through the
   ground.
3. **Testability.** A test runs a known number of steps at a known `dt` and asserts an exact result. No
   real timers, the same discipline `02_spec.md`'s clock injection already established for the history
   buffer.

The leftover accumulator gives the renderer an `alpha` between `0` and `1` for interpolating between
`previousPosition` and `position`. Without it, motion visibly stutters whenever the display's refresh
rate and the simulation's step rate don't line up evenly — which is most of the time, since 120Hz physics
on a 60Hz screen means every other frame lands exactly between two steps.

## Particles

Action simulates one entity per firework — the shell. It does not simulate the hundreds of sparks in a
burst as individual entities.

This bends decision 1's "AudioVisual never re-derives anything Action already decided," so it's worth
stating plainly rather than papering over: sparks have no effect on the game, nothing reads their
positions to decide anything, and pushing thousands of per-particle positions across the layer boundary
every frame would cost far more than it buys. Action decides everything that matters — burst position,
pattern, colours, count, duration, and a seed — and AudioVisual expands that into individual sparks using
`spec.seed`, so two renderers given the same spec produce the same-looking burst even though neither one
asked Action where each spark goes.

If sparks ever need to affect gameplay (a spark that lights another firework, say), they become entities
and this line moves.

## File layout

```
src/action/
  types.ts         Vec3, Seeds, FireworkSpec, FireworkPhase, Firework,
                    FireworkPattern, FireworkTimbre, FireworkSound
  config.ts        ActionConfig + defaultActionConfig
  worldConfig.ts   WorldConfig + defaultWorldConfig
  vector.ts        add, scale, normalise, magnitude                   [pure]
  random.ts        hashString, createRandom, deriveSeeds              [pure]
  launch.ts        pickLaunch(seeds, config)                          [pure]
  traits.ts        pickPattern, pickPalette, pickSound                [pure]
  spec.ts          buildFireworkSpec(signal, config)                  [pure]
  physics.ts       stepPhysics(firework, worldConfig, dtMs)           [pure]
  phase.ts         stepPhase(firework, config, dtMs)                  [pure]
  world.ts         createWorld({ worldConfig, config })
  actionLayer.ts   resolveAction(event, config)                       [pure]
                   createActionLayer({ world, config }) -> ControlEventSink
  debug/
    format.ts        formatFirework(firework) -> string               [pure]
    consoleSink.ts   createSpecConsoleSink(log = console.debug)
src/main.ts        rewired: Control -> Action, plus a fixed-step render loop
```

Everything marked `[pure]` takes a value and returns a value, no side effects — same payoff as the Control
layer's pure files: no browser, no mocking, no timers, just call the function and assert on the result.
`stepPhysics` and `stepPhase` return a **new** `Firework` rather than mutating the one they were given,
which is what makes "step this entity 120 times and assert its final position" a straightforward test with
nothing to reset in between.

Action imports `ControlEvent` and `ControlSignal` directly from `src/control/types.ts`. `src/control/
index.ts` is named in `03_plan_control_layer.md`'s file layout but was never built — nothing needed it —
and it stays unbuilt here too; knip would flag an unused re-export file the moment it existed with nothing
importing from it.

The render loop lives in `src/main.ts`, not in Action. Action exposes `step(elapsedMs)` and never reads a
clock itself, the same rule Control follows with its injected `now`.

## TDD build cycles

Test-driven means: for each numbered item, write the failing test(s) first, then the minimum code to
pass, then move on. Every cycle gets its own commit. Drive each cycle's assertions with an overridden
config, not the default, so a hardcoded implementation fails — same discipline as the Control layer.

**Before cycle 1 — done**: `src/action/` did not exist yet. No setup beyond creating the directory —
`vitest`, `tsc`, `eslint` and `knip` were already configured project-wide from the Control layer's build.

**Cycles:**

1. **`hashString(text): number`.** Same string always gives the same number; two different strings give
   different numbers; the result is a non-negative integer below 2^32; the empty string returns the FNV
   offset basis (a known constant, not zero — asserting the exact value catches an implementation that
   special-cases empty input instead of running the real algorithm on it).
2. **`createRandom(seed): () => number`.** The same seed produces the same sequence of values; two
   different seeds differ on their first value; successive calls from one generator differ from each
   other; every value returned sits in `[0, 1)`.
3. **`deriveSeeds(signal): Seeds`.** The same `id` gives the same `key` whatever the timestamp; the same
   `id` at a different timestamp gives a different `press`; timestamps `1000.4` and `1000.9` give the
   same `press` (proves the floor); different ids at the same timestamp give different `press`.
4. **`vector.ts`** — `add`, `scale`, `magnitude`, `normalise`. Each a one-line test against hand-checked
   numbers, except `normalise`, which gets a second case: normalising a zero vector returns a zero vector,
   not `NaN` — the one edge case that would otherwise silently poison every position downstream of it.
5. **`pickLaunch(seeds, config)`** → `{ velocity, thrust, fuelMs, fuseMs }`. Speed, thrust, fuel and fuse
   all sit inside their configured ranges, driven by ranges unlikely to appear by accident; the same key
   seed always gives the same angle, whatever the press seed is; a different press seed varies the speed;
   an angle of `0` points straight up (`velocity.x` is `0`, `velocity.y` is positive) and `velocity.z` is
   always `0`.

   The split that makes this work: **angle comes from the key seed alone, everything else from the press
   seed.** One key always launches on the same line, so pressing the same key twice feels like the same
   key, while how hard and how far it goes still varies every time.

6. **`pickPattern(seeds, config)`.** Stable for one key seed across many calls; the result is always a
   member of `config.patterns`; a config holding a single pattern returns that one; two configs with
   different pattern lists each return from their own list.
7. **`pickPalette(seeds, config)`.** The same key seed always selects the same colour family; the same key
   with a different press seed still uses that family but returns a different set of colours; the result
   has exactly `config.paletteSize` entries; every colour returned exists in the chosen family.

   "A different set of colours" is not guaranteed by construction — two draws can coincide when
   `config.paletteSize` is close to the family's size. Give the test families several times larger than
   `paletteSize`, and choose the two fixture timestamps after running the test once and looking at the
   actual output, so the assertion is deterministic **and** correct, not deterministic and quietly
   flaky on the next unrelated code change.

8. **`pickSound(seeds, config)`.** Pitch is stable per key seed; pitch sits inside `config.sound.pitch`,
   checked with a deliberately unusual range so a hardcoded pitch can't pass; timbre is a member of
   `config.sound.timbres` and stable per key.
9. **`buildFireworkSpec(signal, config)`.** Assembles the recipe from the pieces above. `origin`
   deep-equals `config.launchOrigin`; `launchedAt` equals `signal.timestamp`; `id` is deterministic and
   differs between two presses of the same key at different times; every numeric field sits inside its
   configured range; the same signal fed through twice produces a deep-equal spec.
10. **`createFirework(spec)`.** Phase is `"armed"`; `position` and `previousPosition` both equal
    `spec.origin`; `velocity` equals `spec.velocity`; `fuelRemainingMs` and `fuseRemainingMs` equal the
    spec's `fuelMs` and `fuseMs`; `phaseElapsedMs` is `0`.
11. **`stepPhysics(firework, worldConfig, dtMs)`** — the heart of this layer:
    - With zero gravity, zero wind, zero drag and no fuel remaining, position advances by exactly
      `velocity * dt`.
    - With gravity only, an object launched straight up rises, its `velocity.y` crosses zero exactly
      once, it falls back to its launch height, and its speed there is close to its launch speed. Assert
      those properties, not the closed-form `v²/2g` peak height — semi-implicit Euler overshoots the
      analytic peak by an amount tied to `dt`, so comparing against the formula needs a tolerance nobody
      can pick correctly before seeing real output.
    - Wind moves an object sideways over time; doubling the wind vector doubles the sideways offset over
      the same span.
    - Drag reduces speed every step and never reverses the direction of motion.
    - Thrust applies to acceleration while `fuelRemainingMs > 0` and stops being applied once it reaches
      zero, with the entity remaining in `flying` in both cases (phase changes are cycle 12's job, not
      this one's).
    - `previousPosition` after a step equals `position` before the step ran.
    - Stepping the same firework twice from the same starting values gives identical results — no hidden
      state anywhere in this function.
12. **`stepPhase(firework, config, dtMs)`.** `armed` becomes `launching` becomes `flying` on the
    configured durations; `flying` becomes `exploding` once `fuseRemainingMs` reaches zero; `exploding`
    becomes `finished` after `burstDurationMs`; a fuse shorter than `launchDurationMs` bursts while still
    in `launching`, proving the fuse really is independent of the other timers; fuel reaching zero changes
    no phase at all; `phaseElapsedMs` resets to `0` on every transition.
13. **`createWorld({ worldConfig, config })`.** `spawn(spec)` adds a new entity; `step(elapsedMs)` runs
    `floor(elapsed / stepMs)` fixed steps and carries the remainder forward, so two calls of `8`ms against
    a `10`ms step run exactly one physics step between them, not two; `entities()` returns a copy, so a
    caller mutating the result never touches stored state — the same guarantee `createHistory.recent()`
    gives, for the same reason; entities in the `finished` phase are removed at the end of the step that
    reached it; `alpha()` returns the leftover fraction, between `0` and `1`; two fresh worlds given the
    same spawns and the same sequence of elapsed values end up in identical states.
14. **`resolveAction(event, config)`.** A `"single"` event returns exactly one spec, deep-equal to what
    `buildFireworkSpec(event.signal, config)` would produce directly, wrapped in an array. The array is
    the seam decision 4 reserves — a chord or a sequence-triggered extra firework appends to it later
    without this function's signature changing.
15. **`createActionLayer({ world, config })`.** Returns a plain function matching `ControlEventSink`'s
    shape, the same idea as `createConsoleSink` in the Control layer; feeding it a list of events spawns
    one entity per resolved spec into the world, in order.
16. **`formatFirework(firework)`.** One exact string per fixture firework, asserted in full, not with
    `toContain` — the same reasoning as the Control layer's `formatControlEvent`: the text is testable on
    its own, with nothing spying on `console`.
17. **`createSpecConsoleSink(log = console.debug)`, then the harness.** One-line sink, still test-first —
    "small" isn't an exception to `CLAUDE.md`'s TDD rule. Then rewire `src/main.ts`: the Control layer's
    sink becomes `createActionLayer({ world, config: defaultActionConfig })`, and a
    `requestAnimationFrame` loop feeds real elapsed milliseconds into `world.step`. Expose the world on
    `window` beside the existing `window.controlLayer`, for the same devtools-poking reason.

Cycles 6 through 8 are cosmetic and nothing renders yet at that point — they can be deferred to after
cycle 13 if reaching a moving, if colourless, firework sooner is more motivating than building every trait
picker up front.

Wiring note for cycle 17: pass the sink as a wrapped call (`(event) => sink(event)`), not a bare method
reference. ESLint's `no-unbound-method` blocks detaching a method from its object, the same trap cycles 5
and 7 of the Control layer plan hit.

## Critical files

| Path                              | Purpose                                               |
| --------------------------------- | ----------------------------------------------------- |
| `src/action/types.ts`             | The Action-layer contract — grown one cycle at a time |
| `src/action/config.ts`            | Firework-recipe tunables                              |
| `src/action/worldConfig.ts`       | World tunables — gravity, wind, drag, step size       |
| `src/action/vector.ts`            | Cycle 4                                               |
| `src/action/random.ts`            | Cycles 1–3                                            |
| `src/action/launch.ts`            | Cycle 5                                               |
| `src/action/traits.ts`            | Cycles 6–8                                            |
| `src/action/spec.ts`              | Cycle 9                                               |
| `src/action/physics.ts`           | Cycle 11                                              |
| `src/action/phase.ts`             | Cycle 12                                              |
| `src/action/world.ts`             | Cycles 10 and 13                                      |
| `src/action/actionLayer.ts`       | Cycles 14 and 15                                      |
| `src/action/debug/format.ts`      | Cycle 16                                              |
| `src/action/debug/consoleSink.ts` | Cycle 17                                              |
| `src/main.ts`                     | Cycle 17 — rewired from Control's sink to Action's    |

## Out of scope

- Sequences and chords, and any reading of Control's history buffer.
- Any use of `signal.shift`. The field arrives at Action and nothing reads it yet.
- Collisions between fireworks, collision with the ground, and simulating individual spark particles as
  entities — see "Particles" above.
- Variable wind, wind gusts, or any world parameter that changes during play — `WorldConfig` is constant
  for the whole session in v1.
- WebGL, Web Audio, sprites, particle rendering — anything that draws or plays sound. This plan produces
  simulated fireworks and a way to read their state as text, nothing more.
- Networking. The determinism this plan builds — fixed timestep, seeded randomness, no real clock reads —
  is what a future multiplayer implementation would depend on, not something it needs yet.

## Verification

- `npx vitest run` — every cycle's tests green, the whole suite still finishing in well under a second. A
  physics suite that takes seconds to run is a sign some test is stepping the simulation with a real timer
  instead of a fixed, injected `dt`.
- `npx tsc` — clean under `strict`.
- `npx eslint .`, `npx prettier --check .`, `npx knip` — clean before each commit. The pre-commit hook
  (Husky, `.husky/pre-commit`) enforces most of this automatically, the same as the Control layer.
- `npm run build` — still produces a working `dist/`.
- Manual, in `npm run dev`:
  - Press a key. Console lines trace one firework through `armed`, `launching`, `flying`, `exploding`,
    `finished`, and then it stops appearing.
  - Its `y` position rises, slows, and is falling again before the fuse ends, given a fuse long enough to
    show it — gravity is doing real work, not just present in the config.
  - Its `x` position drifts consistently in one direction over the flight — wind is doing real work.
  - Press the same key ten times in a row. The launch angle stays the same each time; speed, fuel and fuse
    vary.
  - Press ten different keys. Angles differ between keys, and once cycles 6–8 land, so do pattern and
    colour family.
  - Set `wind` and `gravity` to `{ x: 0, y: 0, z: 0 }` in the config and reload: flight becomes a straight
    line, confirming the physics has no other hidden force baked in.
  - Grep `src/action/` for `Math.random`, `Date.now`, and `performance.now` — no hits.

## Explicitly not in this plan

The AudioVisual layer (anything that reads a `Firework` or `FireworkSpec` and draws or plays it), sparks
as simulated entities, sequences, chords, collisions, variable world parameters, and networking. This plan
produces a live, steppable simulation and a way to see it — nothing renders it yet.

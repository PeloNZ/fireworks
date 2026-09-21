# Fireworks game — AudioVisual layer build plan (v1)

See `01_intent.md` for the overall vision, `02_spec.md` for the Control layer, and
`04_plan_action_layer.md` for the Action layer this plan builds on top of. This document is the _how_
for the AudioVisual layer: a text renderer, a spark and trail model, and synthesised sound effects.

This document assumes no background in rendering or audio. Where a decision needs a concept explained,
the explanation is here in full, not linked out.

**Out of scope here**: any renderer beyond ASCII, background music, stereo panning, and networking. This
plan draws a character grid and plays two kinds of sound effect — a launch and a burst — nothing more.

## Why AudioVisual does not simulate sparks, and why it isn't the renderer either

Action simulates one entity per firework: the shell. It hands this layer a burst's position, pattern,
colours, particle count, duration, and a seed — not the sparks themselves. Something has to turn those
numbers into hundreds of moving points. Two wrong homes for that job, and the right one:

**Not Action.** One question decides it: does anything other than a renderer read a spark's position to
make a decision? No — nothing in this game reads where a spark is and acts on it. Pushing 40 to 120
spark positions per firework across the layer boundary, every physics step, at 120Hz, buys nothing and
costs real work. `04_plan_action_layer.md` already drew this line and named the condition for moving it:
_"If sparks ever need to affect gameplay (a spark that lights another firework, say), they become
entities and this line moves."_ Nothing in this plan changes that condition.

**Not the renderer.** If each renderer (ASCII today, WebGL2 later) expanded a burst into sparks itself,
two renderers could draw two different-looking bursts from the same spec — the exact failure
`01_intent.md` rules out: _"AudioVisual never re-derives anything Action already decided."_ Two ASCII
grids and a WebGL2 canvas, all looking at the same `FireworkSpec`, must agree on where every spark is.

**The AudioVisual core**, then — the part of this layer shared by every renderer, before any renderer
sees a frame. It reads a `Firework`, computes where its sparks are right now, and hands a renderer a
list of points to draw. The renderer's only job is to put a point on a screen; the core's job is to
decide where that point is.

Sparks are computed with no stored state at all — a spark's position is a plain function of the burst's
spec, the spark's index, and how long ago the burst started. Call the same function twice with the same
inputs and it gives the same answer. This is called **closed-form**: instead of stepping a spark forward
frame by frame and accumulating its position (which needs somewhere to store "where is spark #12 right
now"), the function computes position directly from elapsed time, the way `position = start + velocity *
time` needs no memory of anywhere in between. A tab that was backgrounded for ten seconds and wakes up
mid-burst lands every spark exactly where it should be, with no ten seconds of skipped frames to replay.
It also makes trails almost free: a trail is just this same function evaluated at a slightly earlier
time.

## Decisions

1. **One layer, two ports.** `createAudioVisualLayer({ renderer, audio, config, worldConfig })` reads
   Action's snapshot once per frame and drives a `Renderer` and an `AudioSink`. Both are plain function
   types, the same idea as Control's `ControlEventSink`. Control has device-specific adapters feeding a
   neutral core (`buildSignal` never knows a keyboard exists); this layer is that shape mirrored — a
   neutral core feeding device-specific adapters (an ASCII grid never knows Action exists).
2. **Rendering and audio read the same snapshot, and share nothing else.** One call to
   `entities()` per frame. `frame.ts` (visuals) and `voices.ts` (sound) never import each other. There is
   no reason to make these two top-level layers — they'd only duplicate the wiring and the snapshot read.
3. **The core produces data. Adapters translate it.** Rendering output is a **display list**: a `Frame`
   holding a flat array of `Sprite` values in world space. Audio output is a **voice plan**: a
   `readonly Voice[]` describing what to play. Both are ordinary values a test can assert on in full,
   with nothing hidden inside a canvas or an `AudioContext`. Only the thin last step — writing a string
   into a DOM node, or telling a real `AudioContext` to start an oscillator — is adapter code, and even
   that is tested against a fake target, the same pattern `createKeyboardAdapter` already uses against a
   fake `EventTarget`.
4. **The frame is in world space, never pixels or character cells.** `04_plan_action_layer.md` refused
   to put physics in percentages of a browser window, because gravity measured that way changes when the
   window resizes. The same argument applies one layer up: the display list stays in the 100×100 world
   space Action already defined, and the ASCII adapter is the only thing that knows what a "column" is.
5. **This layer holds no clock.** `present({ entities, alpha, elapsedMs })` takes everything it needs as
   arguments, the same discipline Control's injected `now` and Action's injected `elapsedMs` already
   follow. `src/main.ts` owns the single `requestAnimationFrame` loop that drives Control, Action and
   this layer in order, every frame.
6. **This layer may remember what it has already seen. It may never decide what happens next.** The only
   state this layer is allowed to hold: which phase each firework was in last frame (so it can notice a
   change), and recent positions per firework (so it can draw a trail). Neither one influences physics,
   randomness, or anything Action decides. That is the complete list — nothing else in this layer keeps
   state across frames.
7. **Everything is keyed on `spec.id`, never on object identity.** `stepPhysics` and `stepPhase` both
   return a new `Firework` object every tick — the objects `entities()` hands back are never the same
   object twice. Any map this layer keeps (last-seen phase, trail history) must use `firework.spec.id` as
   its key. One sharp edge worth knowing: `spec.id` is built from the key and the floored millisecond
   timestamp, so two presses of the same physical key inside the same millisecond produce the same id.
   Harmless and rare, but it is why, in principle, a trail could jump between two unrelated fireworks
   that share one id.

## What this layer converts from, and its exact shape

Facts about the Action contract that this layer's code depends on — see `04_plan_action_layer.md` for
the fuller picture:

- `world.entities(): readonly Firework[]` returns a fresh shallow copy every call, oldest firework
  first. `position` and `previousPosition` are `Vec3` in world units; `world.alpha(): number` is the
  leftover fraction, in `[0, 1)`, between the last two physics steps — this layer uses it to interpolate
  a smooth position between them, explained in "Interpolation" below.
- `spec.colors` is `readonly string[]`, CSS hex strings like `"#ff3b30"`. Parsed once into an `Rgb` of
  three floats in `0..1`, not kept as a string past that point.
- `spec.particleCount` is a **float** (Action's ranges are continuous). Round it before using it as a
  loop count.
- `spec.seed` is reserved by `04_plan_action_layer.md` for exactly this: "AudioVisual's per-particle
  jitter." Feed it into `createRandom`, already exported from `src/action/random.ts` — this layer does
  not write its own random generator.
- World space: 100 units wide, 100 tall, origin at bottom centre, `x` runs `-50` to `50`, `y` runs `0`
  to `100`, and **`y` grows up**. A screen's rows grow down. The ASCII adapter is where that flip
  happens — never inside the core, which stays a rendering-agnostic coordinate space.
- `worldConfig.gravity` and `worldConfig.wind` are accelerations, in world units per second squared,
  despite "wind" sounding like a speed. `worldConfig.drag` is a coefficient in "per second" — it scales
  how much velocity bleeds away each second, not a fixed amount.
- A `finished` firework survives one extra `entities()` call before Action removes it, specifically so a
  renderer gets one last frame to end an effect cleanly. This layer's sparks don't need that grace
  period, because they hold no state of their own to end — closed-form sparks simply stop being computed
  once nothing calls for them. Stated here so the unused guarantee reads as a deliberate non-use, not an
  oversight.

## Rendering from nothing

This section explains rendering with no library, for a reader who has never written any.

### The frame loop

A game does not draw once. It draws over and over, as fast as the screen can show a new image — commonly
60 times a second. Each pass is called a **frame**. Between frames, three things happen in order: read
where everything is now, compute where everything should be a moment later, draw it. This layer's
`present` function is the "draw it" step; Action's `world.step` is the "compute where things should be"
step; `src/main.ts`'s loop is what calls both, every frame, forever.

The browser gives a hook for this: `requestAnimationFrame(callback)` asks the browser to call `callback`
right before its next repaint, and passes it a timestamp. The usual pattern is for `callback` to compute
how much time passed since the last call, do one frame's work, then call
`requestAnimationFrame` again with itself — a loop that keeps itself going, driven by the browser's own
refresh rate rather than a fixed timer.

### Why the elapsed time is clamped

The gap between two `requestAnimationFrame` calls is not always small. If the browser tab is backgrounded
— the player switches tabs, or the OS suspends the window — frames simply stop firing, and the gap when
they resume can be seconds or minutes long. Feeding that whole gap into Action's `world.step` in one call
is a real problem: `world.step` runs an unbounded loop of fixed-size physics steps to catch up, so a
30-second gap becomes roughly 3,600 physics steps computed synchronously in one JavaScript turn, freezing
the tab exactly when it should be recovering.

The fix in this layer's loop is to clamp: never pass more than `config.maxFrameMs` (50ms) of elapsed time
into a single `world.step` call, however long the real gap was. Losing physics ticks after a real stall
is fine — nobody is watching a backgrounded tab's firework mid-flight. What must not happen is one giant
step trying to simulate all of it at once.

That same 50ms number also answers question 3 from the design conversation above: it must sit below the
shortest phase duration Action can produce (100ms at default config), so this layer's phase-watching
never misses an entire phase between two observations. See "Sound cues from phase changes" below.

### Interpolation

Action's physics steps run on a fixed 120Hz timestep — a firework's true position only changes 120 times
a second, in fixed 8.3ms jumps, regardless of how often the screen refreshes. A screen refreshing at 60Hz
sees a fresh physics answer every other frame, but on frames caught in between, drawing the object at its
last known position makes motion look like it's stuttering — visible as a slight jerk on a smooth arc,
especially on a monitor whose refresh rate doesn't evenly divide 120.

`world.alpha()` is the fix: a number between 0 and 1 saying how far between the last two physics steps
"now" actually is. Drawing at `previousPosition + (position - previousPosition) * alpha` — called
**linear interpolation**, or "lerp" — gives a smooth position on every frame, physics step or not. This is
why `Firework` keeps both `position` and `previousPosition`, and why this layer's `lerpVec3` function
exists (cycle 2).

### World space to character cells

The ASCII adapter's whole job is to answer one question for every sprite: which row and column of a
fixed-size character grid does this point land in? World space is continuous (`x` can be `3.7182`); a
grid is discrete (a character occupies one exact cell). Converting between them is two steps:

1. **Scale.** World space is 100 units wide and 100 tall (`x` from `-50` to `50`, `y` from `0` to `100`).
   A grid of `columns` by `rows` cells divides that same span into `columns` equal steps horizontally and
   `rows` equal steps vertically. A world `x` of `0` (dead centre) lands at column `columns / 2`.
2. **Flip.** World `y` grows up; a grid's rows are numbered top to bottom, growing down, the same
   direction as pixels on a screen. Row `0` must correspond to the _top_ of world space (`y = 100`), so
   the conversion is `row = rows - 1 - floor(y / 100 * rows)`, not a direct scale. Skipping this flip is
   the single most common rendering bug in a project like this: everything draws upside down, and a
   firework that should rise appears to fall.

A sprite whose world position lands outside `0..columns` or `0..rows` after this conversion is **clipped**
— simply not drawn — never wrapped to the opposite edge. Wrapping would make a firework that drifts off
one side of the screen reappear on the other, which is not how a firework behaves.

### Draw order and "brightest wins"

Two sprites can land in the same character cell — a shell passing through where a spark trail already
sits, say. A grid cell holds exactly one character, so something has to decide which sprite wins. This
layer's rule is the simplest one that looks right: whichever sprite has the higher `brightness` writes
the cell. This is a crude stand-in for what a real renderer calls
**blending** — combining what's already drawn with what's being drawn on top, usually by adding light
together rather than replacing it outright. A brightness ramp of characters — a space for nothing, `.`
for dim, up through `@` for the brightest — is the entire "colour palette" an ASCII grid has, so "brighter
wins" is close to correct without needing real blending math yet. WebGL2, when it arrives, does this
properly: additive blending, explained where that adapter is built.

### One write, not thousands

An ASCII grid is one big string, one `<pre>` element, and one assignment: `target.textContent = grid`.
Every character updates at once because the whole string is replaced at once — there's no way to update
"just the one cell that changed" in a plain text node, and for a grid this size there's no need to try.
Compare this to what a naive renderer might do instead: touch the DOM once per sprite, once per frame,
possibly hundreds of times a second. The DOM is slow to touch repeatedly; a single string write is not.
This is the same lesson WebGL2 teaches at a larger scale later — thousands of sparks drawn in **one draw
call**, not thousands of individual draw operations, for the same reason: talking to the rendering system
is the expensive part, not the drawing itself.

## Sparks without a particle pool

The usual way a game engine handles an explosion is a **particle pool**: an array of live particles, each
with its own position and velocity, stepped forward every frame the same way Action steps a firework —
`velocity += acceleration * dt`, `position += velocity * dt`. This works, and it's flexible (particles can
collide, particles can be added and removed at any time), but it's mutable state that must be created,
updated, and cleaned up every frame, and its exact look depends on exactly which frames it happened to be
stepped on.

This layer does the opposite: no pool, no per-frame stepping, no stored particle state at all. Instead,
one function computes a spark's exact position given only the burst's spec, the spark's index, and how
much time has passed since the burst started (`firework.phaseElapsedMs`, already tracked by Action).
That's possible because the physics of an individual spark is simple enough to solve directly rather than
approximate step by step:

- **No drag**: a spark thrown outward at a constant speed, falling under gravity, has an exact formula —
  the same one used for a thrown ball — `position = start + direction * speed * t + 0.5 * gravity * t²`.
  No stepping needed; plug in `t` and get the exact answer for any moment, past or future.
- **With drag**: drag means a spark's speed decays over time (`04_plan_action_layer.md`'s physics section
  makes the same point about a firework shell). A sinking speed under drag approaches a fixed ceiling
  called **terminal velocity** — the speed at which drag pulling back exactly balances the fall — and the
  position over time still has a closed form, just an exponential one instead of the ball's simple
  parabola.
- **The one trap**: that exponential formula divides by the drag coefficient. Set drag to exactly `0` (a
  reasonable thing to try — `04_plan_action_layer.md`'s own verification steps ask the reader to zero out
  world constants to prove gravity and wind are doing real work) and the formula divides by zero, which
  in JavaScript gives `NaN` or `Infinity` rather than an error, silently poisoning every spark position
  from then on. `normalise` on a zero vector was Action's version of this same trap. This layer's version
  needs an explicit branch: when drag is `0`, use the no-drag formula directly, never the general one.

With position expressed this way, a trail costs nothing extra: a trail is a handful of points drawn at
`t - δ`, `t - 2δ`, and so on, using the exact same function that computed the spark's current position.
There is nothing to store and nothing that can fall out of sync with where the spark actually is.

## Audio from nothing

This section explains sound synthesis with no library, for a reader who has never written any.

### The `AudioContext` and its graph of nodes

The Web Audio API represents sound as a graph: small building-block **nodes**, each doing one thing,
wired together in a chain, ending at `context.destination` — the speakers. An `OscillatorNode` produces a
continuous tone at a given frequency (measured in **Hertz**, cycles per second — 440Hz is a well-known
tuning reference, the musical note A). A `GainNode` scales volume up or down. A `BiquadFilterNode` shapes
which frequencies pass through and which are attenuated. None of these do anything connected to nothing;
a graph like `oscillator → filter → gain → destination` describes, in one line, "make a tone, shape its
tone colour, control its volume, send it to the speakers." Building and tearing down a small graph like
this, once per sound effect, is the entire technique — no sample files, no pre-recorded audio, ever.

### The gesture requirement

Browsers refuse to let a page make sound before the user has interacted with the page at least once —
this stops a page autoplaying audio the instant it loads. In practice: create the `AudioContext` any
time, but call `context.resume()` inside the very first `keydown` handler, before anything tries to play
a sound. `04_plan_action_layer.md` never needed to know this exists; it's purely a browser policy this
layer's `main.ts` wiring has to satisfy.

### The audio clock, and why sounds are scheduled, not played "now"

An `AudioContext` runs its own high-precision clock, `context.currentTime`, in seconds, completely
separate from `performance.now()`. Audio nodes are told _when_ to start and stop in terms of that clock —
`oscillator.start(context.currentTime + 0.05)` means "start in 50 milliseconds," not "start now." Playing
a sound is scheduling it a small amount ahead — the `lookaheadMs` in this layer's audio config — rather
than starting it the instant JavaScript decides to. This exists because JavaScript's own timing has
small, unpredictable delays (garbage collection pauses, other work queued ahead of it); scheduling a hair
in the future gives the audio thread, which runs independently of JavaScript, room to start the sound
exactly on time regardless.

### Why a raw tone clicks, and what an envelope fixes

Starting an oscillator at full volume and stopping it abruptly produces an audible click at both ends —
an instant jump in the sound wave's amplitude is heard as a snap, the same way a light switching on and
off in zero time looks like a flash rather than smooth. The fix is an **envelope**: a volume curve applied
over the sound's lifetime instead of an on/off switch. The classic shape has four stages, commonly called
**ADSR**:

- **Attack** — volume rises from zero to full over a short time (a few milliseconds is often enough to
  kill the click).
- **Decay** — volume eases down from full to a lower sustained level.
- **Sustain** — volume holds at that lower level for as long as the sound continues.
- **Release** — volume eases back down to zero rather than cutting off.

This layer's `Envelope` type carries exactly these four numbers. In code, an envelope is applied by
scheduling a sequence of `gainNode.gain` changes ahead of time on the audio clock — `setValueAtTime` for
an instant target, `linearRampToValueAtTime` for a smooth ramp to a target by a given time — rather than
setting volume once.

### Two kinds of sound, and why one covers a bang better than the other

An `OscillatorNode` makes a pure tone — good for something musical, like the launch or the state of
"present," but a real explosion doesn't sound like a single clean pitch; it sounds like noise. **White
noise** — a signal where every sample is an independent random value — sounds like static, and a burst
of white noise shaped by an envelope and a filter is a much closer match to a bang or crackle than any
pure tone. Web Audio has no built-in noise generator, so this layer builds one by hand: an
`AudioBuffer` filled, sample by sample, with values drawn from `createRandom(spec.seed)` — deterministic
noise, not `Math.random()`, so the same firework sounds the same every time it's replayed. A
`BiquadFilterNode` afterward shapes that raw noise into something closer to a specific character — a
lowpass filter (letting only low frequencies through) sounds duller and softer; a bandpass filter (only a
narrow band around one frequency) sounds sharper and more focused; combined with a short or long envelope,
this is enough to make `"soft"`, `"sharp"`, and `"crackle"` clearly distinct from each other with nothing
but noise, a filter, and an envelope.

### One voice, one graph, then gone

Each sound effect this layer plays is called a **voice** here — one short-lived node graph, built,
scheduled, and left to clean itself up once its envelope finishes; there is no pool of reusable voices
to manage. All voices funnel through one shared `GainNode` (`masterGain`) before `context.destination`,
so that overall volume can be controlled in one place, and a `maxVoices` cap on how many can be scheduled
at once stops a burst of many simultaneous fireworks from clipping the output (many oscillators added
together can exceed the loudest a speaker can represent, producing distortion).

## Sound cues from phase changes

Rendering redraws the whole world from scratch every frame — there's no concept of "an event," only "here
is everything, right now." Sound is different: a bang happens once, at one instant, and playing it twice
because the renderer looked at the same burst on two consecutive frames would be wrong. This layer needs
to turn Action's continuous state into discrete **cues** — "this just happened."

`04_plan_action_layer.md` already built the phase machine for exactly this purpose: _"Each phase exists
so AudioVisual has a distinct set of effects to draw later."_ Entering `launching` is the launch sound.
Entering `exploding` is the burst sound. No change to Action is needed — this layer simply watches the
phase Action already reports and remembers what it saw last time (`createPhaseWatcher`, decision 6's one
sanctioned use of memory), emitting a cue exactly when a phase changes.

The one way this can go wrong is if a whole phase begins and ends between two observations — a phase this
layer never sees, because no `entities()` call landed while it was current. The numbers rule this out:
default config's shortest phase is `launchDurationMs / 2` = 100ms, and the frame loop is clamped to
50ms (see "Why the elapsed time is clamped" above), so every phase is observed at least once. This is a
real constraint on future retuning, not just an implementation detail: **the frame clamp must always stay
below the shortest phase duration `ActionConfig` can produce.** If `fuseMs` is ever retuned below 50ms,
a launch sound could be silently dropped. If that ever actually happens, the fix is `world.events()` — a
small addition to Action's `world.step` that records the transitions it caused, cleared at the start of
each step, mirroring how `finished` fireworks are already held for exactly one extra frame. Not built now
because nothing in this plan's config needs it.

## Key contracts

`src/audiovisual/types.ts` grows one cycle at a time, the same discipline `src/action/types.ts` used —
knip flags an exported type nothing imports yet, and the pre-commit hook runs knip, so this file does not
land in one commit.

```ts
interface Rgb {
  readonly r: number; // 0..1
  readonly g: number;
  readonly b: number;
} // cycle 1

type SpriteKind = "shell" | "spark" | "trail"; // cycle 3

interface Sprite {
  readonly kind: SpriteKind;
  readonly position: Vec3; // world space
  readonly size: number; // world units, radius
  readonly color: Rgb;
  readonly brightness: number; // 0..1, multiplies color for draw-order and glow
} // cycle 3

interface Frame {
  readonly sprites: readonly Sprite[];
} // cycle 3

type Renderer = (frame: Frame) => void; // cycle 5

type CueKind = "launch" | "burst"; // cycle 16

interface Cue {
  readonly kind: CueKind;
  readonly spec: FireworkSpec;
} // cycle 16

interface Envelope {
  readonly attackMs: number;
  readonly decayMs: number;
  readonly sustainLevel: number; // 0..1
  readonly releaseMs: number;
} // cycle 17

type FilterKind = "lowpass" | "highpass" | "bandpass"; // cycle 22

interface Filter {
  readonly kind: FilterKind;
  readonly frequencyHz: number;
  readonly q: number; // resonance / narrowness
} // cycle 22

type VoiceKind = "tone" | "noise"; // cycle 17 (tone), cycle 20 (noise)

// One scheduled sound. Built once, played once, then discarded.
interface Voice {
  readonly kind: VoiceKind;
  readonly frequencyHz: number;
  readonly frequencyEndHz: number | null; // cycle 20: a glide target; null = constant pitch
  readonly durationMs: number;
  readonly envelope: Envelope;
  readonly filter: Filter | null; // cycle 22; null = no filter stage
  readonly gain: number; // 0..1, before masterGain
  readonly seed: number; // cycle 21: drives the noise buffer, when kind is "noise"
} // cycle 17, grows through 20-22

type AudioSink = (voices: readonly Voice[]) => void; // cycle 18
```

`Filter | null`, not an optional `filter?: Filter` — `exactOptionalPropertyTypes` is on, and `null` says
"no filter stage" without also allowing `undefined` to mean something subtly different.

## Config

One config object, deep-frozen like `defaultActionConfig`, with `ascii` and `audio` nested under their
own keys — the same reasoning `ControlConfig` nests `keyboard`: only the ASCII adapter reads `ascii`,
only the Web Audio adapter reads `audio`, and nesting makes that ownership visible from the shape alone.

```ts
interface AudioVisualConfig {
  readonly maxFrameMs: number; // 50 — see "Why the elapsed time is clamped"
  readonly shellSize: number; // world units, radius
  readonly sparkSize: number;
  readonly sparkSpeed: NumberRange; // world units per second, outward
  readonly sparkGravityScale: number; // fraction of world.gravity a spark feels
  readonly sparkDrag: number; // per second; 0 = none, see "Sparks" above
  readonly trailMaxAgeMs: number; // how long a shell's trail persists
  readonly trailMaxPoints: number; // hard cap, oldest evicted first
  readonly trailSpacingMs: number; // time between two spark-trail samples
  readonly ascii: {
    readonly columns: number; // 80
    readonly rows: number; // 40
    readonly ramp: string; // " .:-=+*#%@" — dimmest to brightest
  };
  readonly audio: {
    readonly lookaheadMs: number; // scheduling headroom on the audio clock
    readonly masterGain: number; // 0..1, overall volume
    readonly maxVoices: number; // hard cap on simultaneous scheduled voices
    readonly crackleCount: number; // micro-bursts for the "crackle" timbre
    readonly launch: {
      readonly durationMs: number;
      readonly envelope: Envelope;
    };
    readonly burst: {
      readonly envelope: Envelope; // base envelope; timbre may adjust decay/release
    };
  };
}
```

80 columns by 40 rows: most monospace fonts render a character roughly twice as tall as it is wide, so
twice as many columns as rows keeps the 100×100 world looking square rather than stretched.

`NumberRange` is imported from `src/action/config.ts` — the same type, not a second copy.

## File layout

```
src/audiovisual/
  types.ts             Rgb, Sprite, Frame, Renderer, Cue, Envelope,
                        Filter, Voice, AudioSink  — one cycle at a time
  config.ts            AudioVisualConfig + defaultAudioVisualConfig
  color.ts             parseHexColor                                   [pure]
  interpolate.ts       lerpVec3                                        [pure]
  sparks.ts            sparkDirections, sparkSpeeds, sparkPosition,
                       expandBurst                                     [pure]
  trails.ts            createTrails({ maxAgeMs, maxPoints })           [state]
  frame.ts             buildFrame({ entities, alpha, trails, config }) [pure]
  phases.ts            createPhaseWatcher() -> cues(entities)          [state]
  voices.ts            planVoices(cue, config)                         [pure]
  audioVisualLayer.ts  createAudioVisualLayer({ renderer, audio, config, worldConfig })
  adapters/
    asciiGrid.ts       rasteriseFrame(frame, asciiConfig) -> string    [pure]
    ascii.ts           createAsciiRenderer({ target, config })
    webAudio.ts        createWebAudioSink({ context, config }),
                       createNoiseBuffer(context, seed, durationMs)
src/main.ts            rewired: Control -> Action -> AudioVisual, one rAF loop
```

`asciiGrid.ts` is split out from `ascii.ts` so the part worth testing in full — world-to-cell mapping,
clipping, draw order — is a pure function returning a plain string. The adapter itself is then one
assignment: `target.textContent = rasteriseFrame(frame, config.ascii)`.

Everything marked `[pure]` takes values and returns a value, same payoff `04_plan_action_layer.md` names
for its own pure files: no DOM, no `AudioContext`, no mocking, just call the function and assert on the
result.

## TDD build cycles

Test-driven, same discipline as the other two layers: write the failing test first, then the minimum
code to pass, one commit per cycle. Three passes, each ending with something to see or hear, because
watching behaviour early matters more here than finishing every function before wiring anything up.

**Before cycle 1 — done**: `src/audiovisual/` did not exist yet. `vitest`, `tsc`, `eslint`, `knip` were
already configured project-wide.

### Pass A — shells on screen

1. **`parseHexColor(hex): Rgb`.** `"#ff3b30"` gives hand-checked `0..1` floats; an uppercase hex string
   works the same; a malformed string (wrong length, non-hex characters) throws.
2. **`lerpVec3(a, b, alpha)`.** `alpha` of `0` returns `a`; `1` returns `b`; `0.5` returns the exact
   midpoint; each axis is independent (driven with a case where `x`, `y`, `z` interpolate by different
   amounts because `a` and `b` differ unevenly per axis).
3. **`buildFrame({ entities, alpha, config })`.** One `"shell"` sprite per firework whose phase is
   `"launching"` or `"flying"`, positioned by `lerpVec3(previousPosition, position, alpha)`; a firework
   in `"armed"`, `"exploding"`, or `"finished"` contributes no shell sprite yet (bursts and endings come
   in Pass B); sprite size is `config.shellSize`; colour is `parseHexColor(spec.colors[0])`; an empty
   `entities()` gives a `Frame` with no sprites. Drive `alpha` with an unusual value like `0.25`, not
   `0.5`, so a hardcoded midpoint fails.
4. **`rasteriseFrame(frame, ascii)`.** One exact grid string asserted in full, against a small fixture
   config (9 columns by 5 rows, easy to hand-check): `y` flips (a sprite near `y = 100` lands near row
   `0`); `x = 0` lands at the centre column; a sprite outside `-50..50` or `0..100` is clipped, never
   wrapped to the opposite edge; two sprites landing in one cell keep the brighter one's character; rows
   are joined with `"\n"`.
5. **`createAsciiRenderer({ target, config })`.** A fake target — a plain object shaped like
   `{ textContent: "" }`, not a real DOM node — records exactly one write per call to the returned
   `Renderer`, and that write equals what `rasteriseFrame` would produce for the same frame.
6. **`createAudioVisualLayer({ renderer, config })`.** Returns `present({ entities, alpha,
elapsedMs })`. Calling `present` once calls the fake renderer exactly once, with the frame
   `buildFrame` would build from the same `entities` and `alpha`.
7. **Extend `src/main.ts`.** Control→Action wiring and the `requestAnimationFrame` loop already exist
   (`window.actionWorld`, `window.controlLayer`). Add a `<pre>` element for the grid, build
   `createAudioVisualLayer({ renderer: createAsciiRenderer({ target, config }), config })`,
   and call its `present({ entities: world.entities(), alpha: world.alpha(), elapsedMs: clamped })`
   inside the existing loop, right after `world.step(clamped)` — `clamped` is the same
   `config.maxFrameMs`-clamped value already being passed to `step`. The console trace from
   `createSpecConsoleSink` stays, unchanged, alongside the new render call.

**Payoff**: press a key, watch a single character rise, curve, and drift across the grid — gravity and
wind both visibly doing real work, for the first time anywhere in this project.

### Pass B — sparks and trails

8. **`sparkDirections(pattern, count, seed): readonly Vec3[]`.** Returns `count` unit vectors (each one's
   `magnitude` is `1`, within floating-point tolerance), `z` always `0`; the same seed gives the same
   array on repeat calls. Per pattern, in this flat, 2D world: `"ring"` spaces angles evenly around a
   full circle with no randomness; `"peony"` jitters each angle around an even spread so it fills a disc
   rather than a ring; `"willow"` biases every direction toward the upper half (a firework that droops
   downward, the shape a real willow firework is named for); `"chrysanthemum"` is `"peony"` with a wider
   angular jitter.
9. **`sparkSpeeds(pattern, count, seed, config): readonly number[]`.** Every value sits inside
   `config.sparkSpeed`, checked against a deliberately unusual range so a hardcoded speed fails;
   `"ring"` gives values close to uniform (all sparks reach the same radius, so they trace one expanding
   circle); `"peony"` and `"chrysanthemum"` vary more, so sparks fill a disc rather than sitting on one
   ring; `"willow"` sits toward the low end of the range (a willow burst hangs rather than exploding
   outward fast).
10. **`sparkPosition(origin, direction, speed, gravity, drag, t)` — gravity only.** With `drag` at `0`:
    `t = 0` returns exactly `origin`; motion at small `t` runs along `direction`; doubling `gravity`
    doubles the downward sag at a fixed `t`; this is the ball-throw formula named in "Sparks without a
    particle pool" above, asserted against hand-computed numbers.
11. **`sparkPosition(...)` — with drag.** The exact exponential form for `drag > 0`, checked against
    hand-computed numbers at one specific `t`. Then the case that matters most: **`drag = 0` must not
    divide by zero** — assert the function returns the same result as cycle 10's gravity-only formula
    when `drag` is exactly `0`, not `NaN` or `Infinity`. Name this test after the trap directly (e.g.
    `"drag of zero falls back to the closed-form gravity-only path"`), the same way `normalise`'s
    zero-vector case in `04_plan_action_layer.md` is a named test, not an incidental one.
12. **`expandBurst(firework, config, worldConfig): readonly Sprite[]`.** `round(spec.particleCount)`
    spark sprites, positioned by `sparkPosition` using each spark's own direction and speed, with `t =
firework.phaseElapsedMs`; colours cycle through `spec.colors` (spark `i`'s colour is
    `spec.colors[i % spec.colors.length]`); `brightness` falls linearly from `1` toward `0` as
    `phaseElapsedMs` approaches `spec.burstDurationMs`; a firework whose phase is not `"exploding"`
    contributes no spark sprites. Wire this into `buildFrame`, so bursts now draw.
13. **Spark trails.** `expandBurst` also emits `"trail"` sprites per spark, at `t - config.trailSpacingMs`,
    `t - 2 * config.trailSpacingMs`, and so on, up to `config.trailMaxPoints` of them, each dimmer than
    the last; none are emitted before `config.trailSpacingMs` has elapsed since the burst began (no
    negative-time samples).
14. **`createTrails({ maxAgeMs, maxPoints })`.** `record(entities, elapsedMs)` ages every stored point by
    `elapsedMs`, then appends the current position of every firework present, keyed by `spec.id`;
    `points(specId)` returns stored points newest-first, each with its current age; points older than
    `maxAgeMs` are dropped, and a firework holds at most `maxPoints` points, oldest evicted first; an id
    no longer present in `entities` is forgotten entirely, not left to age out slowly. Ageing by
    `elapsedMs` rather than by frame count keeps a trail's length in real time the same on a 144Hz
    monitor as on a 60Hz one — the same reasoning `02_spec.md`'s history buffer already applied to key
    presses. This mirrors `createHistory` in the Control layer closely enough to reuse its shape as a
    reference, not its code (Control's history is unrelated to rendering and stays untouched).
15. **Shell trails in `buildFrame`.** One `"trail"` sprite per point `createTrails` holds for a firework's
    shell, brightness falling as the point's age approaches `trailMaxAgeMs`.

**Payoff**: a burst spreads into the right pattern, colour count, and particle count, and every moving
thing — shell and spark alike — trails a fading streak behind it.

### Pass C — sound

16. **`createPhaseWatcher()`.** Returns `cues(entities): readonly Cue[]`. Calling it with a firework
    entering `"launching"` for the first time gives a `"launch"` cue; entering `"exploding"` gives a
    `"burst"` cue; the very first sighting of a firework in `"armed"` gives no cue (nothing changed —
    there is no prior phase to compare against); a call where nothing's phase changed gives no cues;
    an id present in one call and absent from the next is forgotten, not held onto expecting it to come
    back.
17. **`planVoices(cue, config): readonly Voice[]` — the beep.** A `"burst"` cue returns exactly one
    `"tone"` voice: `frequencyHz` equal to `cue.spec.sound.pitch`, `frequencyEndHz` of `null` (no glide
    yet), `durationMs` equal to `cue.spec.burstDurationMs`, and `config.audio.burst.envelope` used as
    given. Drive the assertion with an unusual `config.audio.burst.envelope` and an unusual
    `spec.sound.pitch`, so a hardcoded envelope or pitch fails. A `"launch"` cue returns no voices yet
    (cycle 20 adds one).
18. **`createWebAudioSink({ context, config })`.** A fake `context` exposing only the surface actually
    used (`createOscillator`, `createGain`, `createBiquadFilter`, `createBufferSource`,
    `createBuffer`, `currentTime`, `destination`), each returning a fake node recording what was called
    on it. Assert: the node chain connects in the right order (oscillator or noise source → filter, if
    any → gain → the sink's shared master gain → destination); the envelope's four stages are scheduled
    as `gain.gain` calls in order; a voice starts at `context.currentTime + config.lookaheadMs / 1000`
    (converting milliseconds to the audio clock's seconds); a call passing more than `config.maxVoices`
    voices at once schedules only the first `config.maxVoices` and drops the rest, rather than throwing
    or ignoring the whole call.
19. **Wire audio in.** `createAudioVisualLayer` gains an `audio: AudioSink` option; `present` now also
    calls `createPhaseWatcher().cues(entities)`, turns each cue into voices via `planVoices`, and calls
    `audio` with the combined list. `src/main.ts` creates a real `AudioContext`, calls `context.resume()`
    inside the existing keyboard adapter's first keydown handling (see "The gesture requirement" above),
    and passes `createWebAudioSink({ context, config: defaultAudioVisualConfig })` as the `audio` port.

    **Payoff**: a firework bursts, and it beeps.

20. **The launch whoosh.** `planVoices` gains a case for `"launch"` cues: one `"noise"` voice, `durationMs`
    equal to `config.audio.launch.durationMs`, `frequencyHz` and `frequencyEndHz` both set so the sound
    rises over its duration (a glide upward, distinct from the burst's flat pitch), using
    `config.audio.launch.envelope`.
21. **`createNoiseBuffer(context, seed, durationMs): AudioBuffer`.** A fake `context.createBuffer` records
    the requested length and sample rate; the buffer's samples are filled from
    `createRandom(seed)` — asserted by checking the same seed always produces the same buffer contents,
    and two different seeds differ. `createWebAudioSink` uses this whenever a voice's `kind` is
    `"noise"`, feeding the buffer into a `BufferSourceNode` instead of an `OscillatorNode`.
22. **Timbre.** `planVoices`'s burst case grows a filter chosen from `cue.spec.sound.timbre`:
    `"soft"` — a low-frequency lowpass filter and a longer release; `"sharp"` — a high-frequency,
    high-Q bandpass filter and a short, snappy release; `"crackle"` — the same bandpass as `"sharp"`,
    plus `config.audio.crackleCount` extra short `"noise"` voices with tiny durations, staggered across
    the burst's duration at offsets drawn from `createRandom(cue.spec.seed)`. Each timbre is asserted as
    its own case, checked against an unusual `crackleCount` so a hardcoded count of extra voices fails.

**Payoff**: three kinds of bang, clearly different from each other, and stable per key — the same
key always sounds the same way, the same hypothesis `01_intent.md` states for sight extended to sound.

## Critical files

| Path                                    | Purpose                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/audiovisual/types.ts`              | The AudioVisual-layer contract, grown one cycle at a time                                         |
| `src/audiovisual/config.ts`             | Rendering and audio tunables                                                                      |
| `src/audiovisual/color.ts`              | Cycle 1                                                                                           |
| `src/audiovisual/interpolate.ts`        | Cycle 2                                                                                           |
| `src/audiovisual/frame.ts`              | Cycles 3, 12, 15                                                                                  |
| `src/audiovisual/adapters/asciiGrid.ts` | Cycle 4                                                                                           |
| `src/audiovisual/adapters/ascii.ts`     | Cycle 5                                                                                           |
| `src/audiovisual/audioVisualLayer.ts`   | Cycles 6, 19                                                                                      |
| `src/audiovisual/sparks.ts`             | Cycles 8–12                                                                                       |
| `src/audiovisual/trails.ts`             | Cycle 14                                                                                          |
| `src/audiovisual/phases.ts`             | Cycle 16                                                                                          |
| `src/audiovisual/voices.ts`             | Cycles 17, 20, 22                                                                                 |
| `src/audiovisual/adapters/webAudio.ts`  | Cycles 18, 21                                                                                     |
| `src/main.ts`                           | Cycle 7 (visuals), cycle 19 (audio) — adds rendering alongside Action's console sink, which stays |

## Out of scope

- Any renderer other than the ASCII grid — Canvas2D, WebGL2, an emoji or sprite adapter. Each is a new
  file behind the existing `Renderer` type; nothing in the core changes to add one.
- Colour in the rendered grid. `Sprite.color` already carries an `Rgb`; the ASCII adapter reads only
  `brightness`. A colour-capable adapter (a coloured terminal, Canvas2D, or later) needs no contract
  change to use the colour that's already there.
- Background music. `01_intent.md` wants music whose pace and density respond to how fast the player is
  playing — a second, independent consumer of the same `AudioSink` port, needing a beat scheduler and a
  scale, and an open question this plan does not answer: whether tempo is decided in Action (a gameplay
  fact, deterministic across a future multiplayer session) or left to this layer. Left as a named seam,
  not designed further here.
- Stereo panning. `Voice` would gain a `pan` field; `createWebAudioSink` would add one
  `StereoPannerNode` per voice, panned by the firework's `x` position. Deferred by request.
- `world.events()` on the Action layer. Only needed if snapshot-diffing in `createPhaseWatcher` is ever
  shown to miss a cue — see "Sound cues from phase changes" above for the constraint that currently
  prevents that.
- Sparks becoming real Action entities. Only under the condition `04_plan_action_layer.md` already
  states: a spark needs to affect gameplay.
- Any use of the `z` axis. Every `Vec3` already carries it and it stays `0` everywhere in this plan, the
  same as in Action.
- Networking. This layer reads a snapshot and produces output with no state that a second machine would
  need to agree on — Action already carries the entire determinism burden for a future multiplayer mode.

## Verification

- `npx vitest run` — every cycle's tests green, no real timers anywhere (a `sparkPosition` or
  `createTrails` test that runs slowly is a sign a real clock or a real animation frame snuck in).
- `npx tsc` — clean under `strict`.
- `npx eslint .`, `npx prettier --check .`, `npx knip` — clean before each commit; the pre-commit hook
  enforces this the same as the other two layers.
- `npm run build` — still produces a working `dist/`.
- `grep -rE "Math.random|Date.now|performance.now" src/audiovisual/` — no hits.
  `performance.now` is used exactly once in the whole project, in the `now: () => performance.now()`
  callback `src/main.ts` passes to `createControlLayer` — not inside the frame loop itself, which reads
  its elapsed time from `requestAnimationFrame`'s own timestamp argument.
- Manual, in `npm run dev`:
  - Press a key. A single character rises, arcs, and slows, then bursts into a spread of characters that
    fan outward and sag, then fade and vanish.
  - Press the same key ten times in a row. The launch angle, pattern, colour family, and pitch all stay
    the same each time; speed, fuse timing, and how tightly the burst spreads all vary.
  - Press ten different keys. Angle, pattern, colours, and pitch all differ between keys, and each key
    sounds distinctly its own.
  - Hold a key down. One firework launches, not a stream of them — Control's repeat filter is still
    doing its job three layers upstream.
  - Set `worldConfig.gravity` and `worldConfig.wind` to `{ x: 0, y: 0, z: 0 }` and reload: the shell's
    flight and every spark's path become straight lines.
  - Set `worldConfig.drag` to `0` and reload: nothing on screen turns into blank cells or stops moving —
    confirms the divide-by-zero branch in `sparkPosition` actually runs.
  - Switch to another browser tab for 30 seconds, then switch back: no freeze on return, no visible burst
    of catch-up motion, and no missing launch or burst sound for whatever was mid-flight when the tab was
    left.

## Explicitly not in this plan

Any renderer beyond ASCII, background music, stereo panning, sparks as simulated entities, and
networking. This plan produces a live, visible, audible fireworks display drawn to a character grid —
nothing beyond that renders or plays.

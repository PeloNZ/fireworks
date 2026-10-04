# Sound sets: a switchable library of synth voices (v1)

See `05_audio_visual_layer.md` for the sound vocabulary this plan builds on — voices, envelopes,
filters, the audio clock. This document is the _how_ for a second thing this game can sound
like: a switchable set of sounds, so a play-test session picks its audience
without a rebuild.

The `?sound=` URL parameter this plan describes was replaced by the settings menu form and the saved
`sound` setting in `13_settings_overrides.md`. The page URL is no longer read. Where a check below
uses `?sound=<name>`, open the menu with Esc, pick that sound set and press Apply.

This document assumes no background in sound design. Where a decision needs a concept explained,
the explanation is here in full, not linked out.

## Why this plan exists

Play testing (`PLAY_TESTING.md`) gave two findings that pull in opposite directions.

The 5-year-old mashed keys, liked that "they make sounds and explode", and asked for **silly
sounds**. The 30-year-old ignored the explosions and worked on the key-to-pitch mapping, trying
to learn it well enough to play a tune.

One fixed sound design cannot serve both. The fix is a **switchable set of sounds**:

- `?sound=tones` — today's design (`voices/tones.ts`). Unchanged. The default.
- `?sound=silly` — a new set (`voices/silly.ts`). Cartoonish, wobbly, unpredictable within a
  press.

The parameter is `?sound=`, singular.

Two constraints hold throughout:

- **The key-to-pitch map stays.** `spec.sound.pitch` and `spec.sound.timbre` come from
  `seeds.key`, so one physical key always gives the same note. The silly set keeps that. A tune
  is still playable. Silliness comes from timbre, effects and per-press variation.
- **No real randomness.** `src/audiovisual/` must never call `Math.random`, `Date.now` or
  `performance.now`. Every silly choice comes from `createRandom(cue.spec.seed)`. That seed is
  `seeds.press`, so it changes on every press and is still replayable.

## Why a sound set is a swap of the planner, not the sink

`04_plan_action_layer.md` and `05_audio_visual_layer.md` both draw their layer boundaries the
same way: find the one thing that has to stay shared, and swap everything else around it.

Here, the shared thing is `createWebAudioSink` — the only file that ever touches Web Audio, and
the thing `05_audio_visual_layer.md`'s "One voice, one graph, then gone" section already
justifies keeping singular. What varies between `tones` and `silly` is not how a voice gets
played, but which voices a cue produces in the first place — `planToneVoices(cue, config)` today,
a pure function from a cue to a list of `Voice` records. A sound set is a **`VoicePlanner`**:

```ts
export type VoicePlanner = (
  cue: Cue,
  config: AudioVisualConfig,
) => readonly Voice[];
```

`createAudioVisualLayer` takes one as an option instead of importing a planner itself.
`main.ts` reads `?sound=` and looks the right one up in a registry — the same `selectRenderer`
lookup `07_emoji_renderer.md` already built for `?renderer=`, against a second table:

```ts
const { create: voicePlanner } = selectRenderer(
  new URLSearchParams(location.search).get("sound"),
  soundSets,
  "tones",
);
```

Reusing `selectRenderer` (rather than building a second, near-identical lookup) is a deliberate
choice: it is already generic, tested, and documented, and this project's own decision 6 in
`07_emoji_renderer.md` is "the choice is a lookup in a table of named factories" — exactly the
same shape needed here.

## Sound design, explained

Each effect below names the thing that makes it sound the way it does, then the Web Audio nodes
that build it.

### What the code already has

The sink builds one small node graph per voice:

```
source -> [filter] -> gain -> masterGain -> destination
```

`source` is an `OscillatorNode` (a pure repeating wave at one pitch) or an `AudioBufferSource`
full of white noise. `gain` applies the envelope. That is the whole vocabulary before this plan.

Three things are missing, and all three are what "silly" is made of.

### 1. Modulation: one oscillator controlling another

An `AudioParam` — `oscillator.frequency`, `filter.frequency`, `gain.gain` — holds a number that
changes over time. Until now the code only sets that number on a schedule.

An `AudioParam` can also take an audio signal as an input. When you connect a node to a param,
the signal is **added** to the scheduled value, sample by sample. Connect a slow oscillator to
another oscillator's `frequency` and the pitch now wavers.

The slow oscillator is called an **LFO** — Low Frequency Oscillator. Below about 20 Hz you stop
hearing it as a pitch and start hearing its effect on whatever it controls. A gain node between
the LFO and the target sets how far the value swings. That is the **depth**.

```
lfo (OscillatorNode, 6 Hz)  ->  depth (GainNode, 30)  ->  oscillator.frequency
```

The oscillator's scheduled pitch is 440 Hz; the LFO adds a value swinging between -30 and +30
six times a second, so the real pitch runs 410-470 Hz.

Two uses:

- **Vibrato** — LFO on pitch. At 5-7 Hz and a narrow depth this is how a singer holds a note.
  At a **wide** depth, more than a semitone, it stops sounding musical and starts sounding
  drunk or comic. Wide is what this plan wants.
- **Wah** — LFO on a lowpass or bandpass filter's cutoff. The pitch holds still and the
  brightness sweeps up and down. This is the "wah-wah" of a talking mute on a trumpet.

Depth is measured in **Hz**, not semitones, because the signal is added, not multiplied. A
depth of 30 Hz on a 220 Hz note is about two semitones. The same 30 Hz on an 880 Hz note is
about half a semitone. Scaling the depth by the note's own pitch keeps the wobble even, the same
way `softFilterFor` already scales its cutoff by pitch in `voices/tones.ts`.

`Lfo` (cycle 4) is the type this plan adds for this:

```ts
export interface Lfo {
  readonly rateHz: number;
  readonly depth: number;
}
```

`Voice` gains `pitchLfo: Lfo | null` (cycle 4) and `filterLfo: Lfo | null` (cycle 5). The sink's
`attachLfo` helper builds the LFO oscillator and its depth gain, connects them into the target
param, and starts and stops the LFO on the voice's own clock — a forgotten `start()` gives
silent modulation and no error, which is why the tests assert it explicitly.

### 2. Ring modulation: multiplying two signals

A gain node multiplies its input by its `gain` value. Set that value to zero and connect an
audio-rate oscillator to `gain.gain` instead, and the output is the input **multiplied** by the
modulator.

```
carrier ------------> ring (GainNode, gain scheduled to 0)
modulator (400 Hz) -> ring.gain
```

Multiplying two sine waves does not give you those two pitches. It gives you their **sum** and
their **difference**. A 440 Hz carrier and a 400 Hz modulator produce 840 Hz and 40 Hz — two
frequencies with no simple ratio to the original. Pitches with no simple ratio sound
**inharmonic**: clangy, metallic, robotic. This is the Dalek voice, and it is the single most
cartoonish thing in this list.

The modulator frequency is an awkward multiple of the carrier — 1.4-2.8, never a round number —
because a whole-number ratio lands the sidebands back on the harmonic series and the effect
mostly disappears.

Ring mod needs no new node type: `createGain` and `createOscillator` already exist on the port.

### 3. Comb filtering: mixing a signal with a delayed copy of itself

Take a signal, delay a copy of it by a few thousandths of a second, then add the copy back to
the original. At any frequency where the delay equals half a wavelength, the copy is upside
down relative to the original and the two cancel. Where the delay equals a whole wavelength
they reinforce. The result is a row of evenly spaced notches across the spectrum — a **comb
filter**.

Hold the delay still and it sounds like a fixed tone colour. **Sweep the delay with an LFO**
and the notches slide up and down. That sliding is the whoosh of a jet passing overhead.

**Flanger.** Delay of 1-10 ms, swept by a slow LFO at 0.1-1 Hz, with feedback: some of the
delayed output fed back into the delay input, which deepens the notches. Strong, obvious,
metallic.

```
source --------------------------------> gain        (dry)
source -> delay(2 ms) ------------------> gain        (wet)
                ^  |
                |  +-> feedback (GainNode 0.5) -+
                +------------------------------+
lfo (0.4 Hz) -> depth (GainNode 0.002) -> delay.delayTime
```

`delayTime` is in **seconds**, so a 2 ms base delay is `0.002` and the LFO depth is `0.002`
too. Needs one new node type on the port: `createDelay`.

**Phaser.** The same swept-notch idea, built differently. An **allpass** filter passes every
frequency at full volume but shifts each one's phase by a different amount. Chain four to eight
of them, mix the output with the dry signal, and you get notches where the phase shift reaches
half a cycle. Sweep the allpass frequencies with an LFO and the notches sweep.

The difference from a flanger: a flanger's notches are evenly spaced and there are many. A
phaser's are few and unevenly spaced — smoother, less metallic, more "swirly."

Phaser needs **no new node type at all**: `createBiquadFilter` already exists, and `"allpass"`
is just another value for `node.type`. Adding `"allpass"` to the `Filter` union (cycle 6) is
what makes phaser the cheapest of the three effects to build.

`VoiceEffect` (cycles 6-8) is the declarative type for all three:

```ts
export type VoiceEffect =
  | { readonly kind: "ringmod"; readonly frequencyHz: number }
  | {
      readonly kind: "flanger";
      readonly delayMs: number;
      readonly feedback: number;
      readonly lfo: Lfo;
    }
  | {
      readonly kind: "phaser";
      readonly stages: number;
      readonly baseHz: number;
      readonly lfo: Lfo;
    };
```

`Voice` gains `effect: VoiceEffect | null`. Planning stays pure data; only the sink ever touches
Web Audio.

### 4. Things that need no new machinery

Three more silly tricks fall out of the existing `Voice` fields. The planner emits extra
voices; the sink needs no change at all.

- **Detuned unison.** Plan the same note twice, one voice a few Hz off the other. The two waves
  drift in and out of alignment, so the combined volume pulses at the difference frequency.
  Three Hz apart gives three pulses a second. Thick, out of tune, slightly seasick. Free: two
  voices instead of one.
- **A bouncing envelope.** A "boing" that bounces is several short voices, each one starting
  later (`startOffsetMs`), each quieter (`gain`) and shorter than the last. Free: the crackle
  timbre already uses `startOffsetMs` this way.
- **Square and triangle waves.** A square wave contains only odd harmonics and sounds hollow
  and buzzy — the sound of an early games console. A triangle is softer than a square and
  rounder than a sawtooth: the closest of the four to a slide whistle. Free: `waveform` is
  already a `Voice` field.

### 5. What actually makes a sound read as a cartoon

1. **Move the pitch a long way, fast.** Real sounds barely change pitch. Cartoon sounds swoop
   an octave or more in a quarter of a second.
2. **Wobble wider than a singer would.** Narrow vibrato reads as expressive. Wide vibrato reads
   as funny.
3. **Use inharmonic pitches.** Ring mod, on purpose, off-ratio.
4. **End on a surprise.** A tail that jumps an octave up, or slides down in three steps, turns
   an explosion into a punchline.
5. **Vary it every press.** The same daft noise four times stops being funny. Different every
   time, from the same key, keeps a key masher going.

## The silly set, sound by sound

All values below are starting points for play testing, not final.

**Where each value lives** decides whether a cycle can be tested properly. Asserting against
something a shortcut would fail is only possible when a value is a config field, not a module
constant. So the split is:

- **Module constants in `silly.ts`** — fixed shape ratios that no test needs to vary: the
  `× 0.5` to `× 3` launch glide, the 1.4-2.8 clang ratio range, the LFO rates. This matches how
  `voices/tones.ts` names `LAUNCH_START_HZ` and the rest.
- **`config.audio.sets.silly`** — counts and levels a test must drive with an unusual value:
  `flightVoiceGain`, `bounceCount`, `bounceDecay`, `gremlinChance`. Grown one field per cycle,
  the same discipline `config.ts` follows everywhere else.

`crackleCount` already exists under `config.audio` and is shared by both sets.

`pitch` is `cue.spec.sound.pitch`, 220-880 Hz, fixed per key. `random` is
`createRandom(cue.spec.seed)`, so every draw below is stable for one press and different on the
next.

### Launch — a slide whistle

One `"tone"` voice. Triangle wave. Glides from `pitch × 0.5` up to `pitch × 3`, over
`config.audio.launch.durationMs`. A pitch LFO at 7 Hz, depth `pitch × 0.04`, adds a shake to
the rise.

The rising direction matters: the shell is going up, so the pitch goes up. Keeping that link
means the sound still explains the picture, however daft it gets.

### Flight — a wobbling theremin

Two `"tone"` voices, both lasting `spec.fuseMs`, both at `config.audio.sets.silly.flightVoiceGain`.

- Voice one: sine at `pitch × 0.5`.
- Voice two: sine at `pitch × 0.5 + detuneHz`, where `detuneHz` is `random()` scaled to 2-6 Hz.

Both carry a pitch LFO whose rate is drawn per press, 4-9 Hz. The two detuned voices beat
against each other, and the LFO wobbles both. The result is a UFO hovering, not a whistle.

Total gain of the pair must not exceed today's single `config.audio.flight.gain` of 0.18, so
each voice starts at 0.09.

### Burst — one per timbre

The three existing timbres stay as the branch, so each key keeps its own character.

**`soft` — a boing.** Square wave at `pitch × 2`, gliding down to `pitch × 0.75` over 250 ms,
with a fast wide pitch LFO (16 Hz, depth `pitch × 0.15`). Then `config.audio.sets.silly.bounceCount`
more voices after it: same shape, each starting later via `startOffsetMs`, each
`config.audio.sets.silly.bounceDecay` of the previous voice's gain and duration. Start at
`bounceCount: 2` and `bounceDecay: 0.6`. Down-then-bounce is the sound of something hitting a
floor.

**`sharp` — a clang.** Sawtooth at `pitch`, through a ring modulator whose frequency is
`pitch × ratio`, with `ratio` drawn per press from 1.4-2.8. Short, snappy envelope, the same
`SHARP_RELEASE_MULTIPLIER` today's sharp uses. Inharmonic and metallic. Every press of the same
key clangs differently because the ratio is redrawn.

**`crackle` — a fizzy raspberry.** One filtered noise voice through a **flanger** for the body,
plus `config.audio.crackleCount` short **square-wave** micro-tones instead of today's noise
micro-bursts. Each micro-tone is at a random pitch drawn from 3-8 times the base pitch,
staggered across the burst with `startOffsetMs`. Squeaks rather than static.

### The gremlin — a per-press surprise tail

This is **not** a random octave jump on the burst's own note — that would break the
key-to-pitch map. This is an extra voice added **after** the burst has finished. The note
itself is untouched, so the map survives.

After planning the burst, draw once more. If `random() < config.audio.sets.silly.gremlinChance`
(start at 0.25), add one extra voice:

- A squeak: sine at `pitch × 4`, 80 ms, starting at the burst's end.
- Or a slide-down: triangle from `pitch` to `pitch × 0.4` over 400 ms.

## File layout

```
src/audiovisual/
  voices/
    tones.ts                planToneVoices — today's design, unchanged
    tones.test.ts
    silly.ts                planSillyVoices
    silly.test.ts
    sets.ts                 the named registry, soundSets
  adapters/webAudio.ts       grows: LFOs and the three effects
  audioVisualLayer.ts        takes a voicePlanner option
  config.ts                  audio.sets.silly tunables
src/main.ts                  reads ?sound= through the existing selectRenderer
```

## Build cycles

TDD, red before green, one commit each, per `CLAUDE.md`.

### Pass A — the seam. No new sound.

1. **Move and rename — a refactor commit, not a TDD cycle.** `voices.ts` becomes
   `voices/tones.ts`, its export renamed `planToneVoices`. No behaviour to drive red first.
2. **`VoicePlanner` and the planner option.** `createAudioVisualLayer` takes
   `voicePlanner: VoicePlanner` and calls it instead of importing a planner directly.
3. **`soundSets` and the `?sound=` URL read.** `voices/sets.ts` exports
   `soundSets: Record<string, VoicePlanner>` with one entry (`tones`). `main.ts` reads
   `?sound=` through the same `selectRenderer` it already uses for `?renderer=`.
   **Payoff**: `?sound=tones` and any unknown name both sound identical to before this plan.

### Pass B — the vocabulary. Sink grows, `tones` unchanged.

4. **`Lfo` and `pitchLfo`.** The sink builds an LFO oscillator plus a depth gain and connects
   it to a tone voice's own oscillator frequency, started and stopped on the voice's own clock.
   `AudioNodeLike.connect` widens to accept an `AudioParamLike` — checked against a real
   `AudioContext` with `tsc` before writing the helper.
5. **`filterLfo`.** Same helper, targeting the filter node's cutoff. Nothing is built when the
   voice has no filter.
6. **`"allpass"` and `effect: "phaser"`.** `stages` allpass filters in series, one shared LFO
   sweeping every stage, mixed with dry into the voice gain.
7. **`effect: "ringmod"`.** A gain node with `gain` scheduled to zero, a modulator oscillator
   connected to that `gain`, the source connected through it.
8. **`effect: "flanger"`.** `createDelay` on the port, a feedback gain, an LFO into
   `delayTime`, dry and wet both into the voice gain.

### Pass C — the silly set.

9. **`planSillyVoices` — launch.** The slide whistle.
10. **Flight.** Two detuned voices, both with a pitch LFO. Adds `config.audio.sets.silly` with
    `flightVoiceGain`.
11. **Burst — `soft`, the boing.** Downward glide, fast wide LFO, plus the bounce voices. Adds
    `bounceCount` and `bounceDecay`.
12. **Burst — `sharp`, the clang.** Ring mod with a seed-drawn ratio.
13. **Burst — `crackle`, the fizz.** Flanged noise plus square-wave micro-tones.
14. **The gremlin tail.** Adds `gremlinChance`.
15. **Register `silly`.** Raises `config.audio.maxVoices` from 16 to about 32 — the silly set
    plans more voices per cue than `tones` does, and several fireworks in the air at once would
    otherwise hit the cap and drop voices silently.
    **Payoff**: `?sound=silly` is daft, and the same key still plays the same note.

## Verification

Tests, per `CLAUDE.md`'s pre-commit list, on every cycle:

```bash
npx vitest run && npx tsc && npx eslint . && npx prettier --check . && npx knip
```

The invariant that keeps the layer pure must stay empty:

```bash
grep -rE "Math\.random|Date\.now|performance\.now" src/audiovisual/
```

By hand, in a browser — the only way to judge a sound (`npm run dev`):

1. No saved settings, then `tones` picked in the menu — both identical to before this plan.
2. `silly` picked in the menu, one key pressed five times — the **note** is the same every time; the
   wobble, the clang ratio and the gremlin tail differ between presses.
3. Still in `silly`, key A five times then key S five times — A's five agree with each other,
   S's five agree with each other, A is clearly a different note from S, in the same direction
   as `tones`. Do not expect a note to match _across_ sets — the silly `soft` burst glides and
   the silly `sharp` burst is ring modulated, so neither sits on a flat `pitch` the way `tones`
   does. What survives across sets is the mapping, not the exact frequency.
4. A short tune in `silly` — it must still read as a tune. This is the check that matters.
5. Mash keys for ten seconds — listen for clipping (too many voices summed past full scale) and
   for silence (the `maxVoices` cap dropping voices).
6. An unknown sound name falls back to `tones`, not silence. Run
   `localStorage.setItem("fireworks.settings", JSON.stringify({ sound: "nonsense" }))` in devtools and
   reload. Clear it with Esc, Defaults.

Then play test it with the 5-year-old and write what happened into `PLAY_TESTING.md`.

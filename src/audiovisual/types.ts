// The AudioVisual-layer contract, grown one cycle at a time — same
// discipline as src/action/types.ts. knip flags an exported type nothing
// imports yet as dead code, so a type lands here only in the cycle that
// first needs it. See docs/05_audio_visual_layer.md.

import type { FireworkSpec, Vec3 } from "../action/types.ts";
import type { AudioVisualConfig } from "./config.ts";

/**
 * A colour as three floats in 0..1, the form every brightness and blend
 * calculation in this layer works in. See `parseHexColor` in color.ts.
 */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** One point to draw, already in world space — a renderer's only job is
 * to turn this into pixels or characters. See `buildFrame` in frame.ts. */
export interface Sprite {
  readonly kind: "shell" | "spark" | "trail";
  readonly position: Vec3;
  readonly size: number; // world units, radius
  readonly color: Rgb;
  readonly brightness: number; // 0..1, multiplies color; also breaks ties
  // when two sprites land in the same cell — see "brightest wins" in
  // docs/05_audio_visual_layer.md.
  readonly velocity: Vec3; // world units per second; zero if it does not move
} // cycle 3

/** One ambient item for one frame, in world space like a `Sprite`. It is
 * a separate list from `Frame.sprites` on purpose: `contestCells` gives each
 * cell to the brightest sprite, so a mover in `sprites` could take a cell
 * from a fading trail. See docs/11_ambient_movers.md. */
export interface Mover {
  // Says what the mover is. A renderer that cannot vary a glyph by
  // brightness picks its picture from this, not from `brightness`.
  readonly kind: "shootingStar" | "satellite";
  readonly position: Vec3;
  readonly velocity: Vec3; // world units per second
  readonly brightness: number; // 0..1
}

/** The whole display list for one frame. See `buildFrame` in frame.ts. */
export interface Frame {
  readonly sprites: readonly Sprite[];
  /** Drawn behind `sprites` and in front of the backdrop. */
  readonly ambient: readonly Mover[];
} // cycle 3

/** A renderer's whole contract: given a frame, draw it. Every adapter
 * (ASCII today, others later) implements this and nothing more. */
export type Renderer = (frame: Frame) => void; // cycle 5

/** A discrete "this just happened," read off Action's phase machine —
 * see `createPhaseWatcher` in phases.ts. Rendering redraws everything
 * from scratch every frame; sound needs an instant, not a snapshot.
 * `"flight"` fires once, entering `"flying"` — a sustained sound for the
 * whole time a shell is airborne, not a one-shot like the other two. */
export interface Cue {
  readonly kind: "launch" | "burst" | "flight";
  readonly spec: FireworkSpec;
} // cycle 16

/** A volume curve over a voice's lifetime, in place of an on/off switch —
 * see "Why a raw tone clicks" in docs/05_audio_visual_layer.md. */
export interface Envelope {
  readonly attackMs: number;
  readonly decayMs: number;
  readonly sustainLevel: number; // 0..1
  readonly releaseMs: number;
} // cycle 17

/** How a `BiquadFilterNode` shapes a voice's tone colour — see "Two kinds
 * of sound" in docs/05_audio_visual_layer.md. */
export interface Filter {
  readonly kind: "lowpass" | "highpass" | "bandpass" | "allpass";
  readonly frequencyHz: number;
  readonly q: number; // resonance / narrowness
} // cycle 22, "allpass" added cycle 6 (docs/08_sound_effects.md)

/** A slow oscillator added to an `AudioParam`, making a value waver
 * instead of holding still — vibrato on a pitch, wah on a filter
 * cutoff, or (cycle 8) a flanger's own delay time. `depth` is in the
 * target param's own units: Hz for a pitch or a cutoff, seconds for a
 * delay time. See "Modulation" in docs/08_sound_effects.md. */
export interface Lfo {
  readonly rateHz: number;
  readonly depth: number;
} // cycle 4, docs/08_sound_effects.md

/** A phaser: `stages` allpass filters in series, each one shifting
 * phase without changing volume, swept together by one shared `lfo` —
 * mixed with the dry signal, the sweep produces moving notches. See
 * "Comb filtering" in docs/08_sound_effects.md. */
export interface PhaserEffect {
  readonly kind: "phaser";
  readonly stages: number;
  readonly baseHz: number;
  readonly lfo: Lfo;
} // cycle 6, docs/08_sound_effects.md

/** Ring modulation: the source multiplied by a second, inaudible-rate
 * oscillator, producing the sum and difference of the two frequencies
 * rather than either one — clangy and inharmonic on purpose. See "Ring
 * modulation" in docs/08_sound_effects.md. */
export interface RingmodEffect {
  readonly kind: "ringmod";
  readonly frequencyHz: number;
} // cycle 7, docs/08_sound_effects.md

/** A flanger: the source mixed with a copy of itself delayed by
 * `delayMs`, some of that delayed copy fed back into the delay
 * (`feedback`, 0..1) to deepen the notches, the delay time itself swept
 * by `lfo` — a jet-whoosh, from a fixed tone colour sliding as the
 * delay moves. See "Comb filtering" in docs/08_sound_effects.md.
 * `lfo.depth` is in the same units as `delayMs` scheduling — seconds,
 * `delayTime`'s own unit — not Hz like a pitch or filter LFO's depth. */
export interface FlangerEffect {
  readonly kind: "flanger";
  readonly delayMs: number;
  readonly feedback: number;
  readonly lfo: Lfo;
} // cycle 8, docs/08_sound_effects.md

/** A node graph inserted between a voice's filter (if any) and its own
 * gain — a swirl or a metallic edge no single filter or LFO can give on
 * its own. Declarative so that planning stays pure data; only the
 * sink's `buildEffect` ever touches Web Audio. */
export type VoiceEffect = PhaserEffect | RingmodEffect | FlangerEffect;

/** One scheduled sound, built once and played once — see `planToneVoices`
 * in voices/tones.ts. `frequencyEndHz` of `null` means a constant pitch; a value
 * is a glide target (cycle 20) — the oscillator's own pitch for a
 * `"tone"`, or the filter's cutoff for a `"noise"` (noise has no pitch of
 * its own to glide). `startOffsetMs` schedules this voice later than the
 * cue's own start — 0 for every voice except crackle's staggered
 * micro-bursts (cycle 22). `gain` is this voice's own peak level, 0..1,
 * before the shared master gain — what lets a quiet background voice
 * (the flight whistle) coexist with a loud one-shot (a burst) without
 * either one needing to guess at the other's volume. `waveform` only
 * matters for `"tone"` — a pure `"sine"` has no harmonics, so a filter
 * has nothing to shape; a richer wave gives soft and sharp timbres an
 * audible difference beyond their release length alone. */
export interface Voice {
  readonly kind: "tone" | "noise";
  readonly waveform: "sine" | "sawtooth" | "square" | "triangle";
  readonly frequencyHz: number;
  readonly frequencyEndHz: number | null;
  readonly durationMs: number;
  readonly envelope: Envelope;
  readonly gain: number; // 0..1, this voice's own peak, before master
  readonly seed: number; // drives a "noise" voice's noise buffer
  readonly filter: Filter | null; // cycle 22
  readonly startOffsetMs: number; // cycle 22
  // A wobble on this voice's own pitch — only meaningful for a "tone",
  // since a "noise" voice has no single pitch to wobble.
  readonly pitchLfo: Lfo | null; // cycle 4, docs/08_sound_effects.md
  // A wobble on this voice's own filter cutoff — only meaningful when
  // `filter` is set; there is no cutoff to wobble otherwise.
  readonly filterLfo: Lfo | null; // cycle 5, docs/08_sound_effects.md
  // A node graph beyond a single filter stage — inserted between the
  // filter (if any) and this voice's own gain.
  readonly effect: VoiceEffect | null; // cycle 6, docs/08_sound_effects.md
} // cycle 17, grows

/** An audio port's whole contract: given the voices planned for this
 * frame, play them. Every adapter implements this and nothing more —
 * the same idea as `Renderer`. */
export type AudioSink = (voices: readonly Voice[]) => void; // cycle 18

/** How a sound set turns one cue into the voices it plays — a sound set's
 * whole contract, the same idea as `Renderer` and `AudioSink`. Swapping
 * this is how `?sound=` changes what a key sounds like; the sink stays
 * the only thing that ever touches Web Audio. `planToneVoices` and
 * `planSillyVoices` are the two implementations. See
 * docs/08_sound_effects.md. */
export type VoicePlanner = (
  cue: Cue,
  config: AudioVisualConfig,
) => readonly Voice[]; // cycle 2, docs/08_sound_effects.md

/** The sky's brightness at the two ends of world space, already capped to
 * `backdrop.skyMaxBrightness`. `zenith <= horizon` always: a sunset glows
 * low and darkens overhead, and a black night is both ends near zero.
 * See `skyBrightnessAt` in backdrop.ts and docs/06_world_backdrop.md. */
export interface SkyGradient {
  readonly horizon: number; // 0..1, at world y = 0
  readonly zenith: number; // 0..1, at world y = 100
} // backdrop cycle 1

/** One static object in the sky. `kind` is all a renderer needs to choose
 * a look — a fixed glyph in the ASCII adapter, a disc in a future Canvas
 * one. There is deliberately no brightness field: a fixed glyph has no
 * brightness to vary, and no field lands here before a test can drive it.
 * See `buildBodies` in backdrop.ts. */
export interface CelestialBody {
  readonly kind: "star" | "moon" | "planet";
  readonly position: Vec3; // z always 0, same as every sprite
} // backdrop cycle 3

/** One sample of the skyline: at world `x`, the ground reaches up to
 * `height`. Consecutive points are joined by a straight line — sample it
 * with `groundHeightAt`, never by indexing, so the interpolation rule
 * stays in the core where every renderer shares it. */
export interface GroundPoint {
  readonly x: number; // world units, -50..50 inclusive
  readonly height: number; // world y of the ridge at this x
} // backdrop cycle 5

/** Everything behind the fireworks, built once per page load and never
 * changed after. Painted bottom to top in field order: sky, then bodies,
 * then ground. `bodies` is itself in paint order — later entries draw over
 * earlier ones, which is what makes the moon beat a star sharing its cell
 * without any overlap test. Deliberately not part of `Frame`: nothing here
 * varies frame to frame, and a backdrop drawn as sprites would compete
 * with the fireworks for cells. See docs/06_world_backdrop.md. */
export interface Backdrop {
  readonly sky: SkyGradient;
  readonly bodies: readonly CelestialBody[];
  readonly ground: readonly GroundPoint[];
} // backdrop cycle 7

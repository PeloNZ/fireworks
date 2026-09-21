// The AudioVisual-layer contract, grown one cycle at a time — same
// discipline as src/action/types.ts. knip flags an exported type nothing
// imports yet as dead code, so a type lands here only in the cycle that
// first needs it. See docs/05_audio_visual_layer.md.

import type { FireworkSpec, Vec3 } from "../action/types.ts";

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
} // cycle 3

/** The whole display list for one frame. See `buildFrame` in frame.ts. */
export interface Frame {
  readonly sprites: readonly Sprite[];
} // cycle 3

/** A renderer's whole contract: given a frame, draw it. Every adapter
 * (ASCII today, others later) implements this and nothing more. */
export type Renderer = (frame: Frame) => void; // cycle 5

/** A discrete "this just happened," read off Action's phase machine —
 * see `createPhaseWatcher` in phases.ts. Rendering redraws everything
 * from scratch every frame; sound needs an instant, not a snapshot. */
export interface Cue {
  readonly kind: "launch" | "burst";
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

/** One scheduled sound, built once and played once — see `planVoices` in
 * voices.ts. `frequencyEndHz` of `null` means a constant pitch; a value
 * is a glide target (cycle 20). */
export interface Voice {
  readonly kind: "tone" | "noise";
  readonly frequencyHz: number;
  readonly frequencyEndHz: number | null;
  readonly durationMs: number;
  readonly envelope: Envelope;
} // cycle 17, grows

/** An audio port's whole contract: given the voices planned for this
 * frame, play them. Every adapter implements this and nothing more —
 * the same idea as `Renderer`. */
export type AudioSink = (voices: readonly Voice[]) => void; // cycle 18

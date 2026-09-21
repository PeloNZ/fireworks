// Rendering and audio tunables for the AudioVisual layer, grown one cycle
// at a time as buildFrame and its neighbours need each field — the same
// discipline src/action/config.ts follows for ActionConfig.

import type { NumberRange } from "../action/config.ts";
import type { Envelope } from "./types.ts";

export interface AudioVisualConfig {
  // The render loop's elapsed-time clamp. Below the shortest phase Action
  // can produce (100ms at default config), so a phase watcher (cycle 16)
  // never misses a transition, and low enough that a backgrounded tab's
  // catch-up on return never runs an unbounded burst of physics steps in
  // one turn. See "Why the elapsed time is clamped" in
  // docs/05_audio_visual_layer.md.
  readonly maxFrameMs: number;
  readonly shellSize: number; // world units, radius
  readonly sparkSize: number; // world units, radius
  readonly sparkSpeed: NumberRange; // world units per second, outward
  readonly trailMaxPoints: number; // hard cap on trail points, oldest evicted first
  readonly trailSpacingMs: number; // time between two spark-trail samples
  readonly trailMaxAgeMs: number; // how long a shell's trail persists
  // The static sky, scenery and ground behind the fireworks, generated
  // once per page load from one seed. World-space and brightness values
  // only — every renderer needs these, so they sit at the top level while
  // the characters that draw them live under `ascii`. See
  // docs/06_world_backdrop.md.
  readonly backdrop: {
    // No sky brightness ever exceeds this, so the fireworks always read
    // clearly over the sky. With the default 10-character ramp, 0.25 keeps
    // every sky cell at or below the ramp's third character.
    readonly skyMaxBrightness: number;
    readonly starCount: NumberRange; // before a lit sky washes some out
    // World y floor for every body. Keep this above the ground's own
    // height range, or a body generates inside the landform and the ground
    // paints over it — wasted scenery rather than a bug, since ground
    // paints last.
    readonly celestialMinHeight: number;
  };
  // Only the ASCII adapter reads this — nested under its own key for the
  // same reason ControlConfig nests `keyboard`: the shape says who owns it.
  readonly ascii: {
    readonly columns: number;
    readonly rows: number;
    readonly ramp: string; // dimmest to brightest, one character per level
  };
  // Only the Web Audio adapter and its planning functions read this,
  // nested under its own key for the same reason ascii is.
  readonly audio: {
    // Scheduling headroom on the audio clock — a voice starts at
    // currentTime + lookaheadMs, giving the audio thread time to start it
    // exactly on time regardless of any delay in the calling JavaScript.
    readonly lookaheadMs: number;
    readonly masterGain: number; // 0..1, overall volume
    readonly maxVoices: number; // hard cap on simultaneous scheduled voices
    readonly crackleCount: number; // extra micro-bursts for the "crackle" timbre
    readonly burst: {
      readonly envelope: Envelope;
    };
    readonly launch: {
      readonly durationMs: number;
      readonly envelope: Envelope;
    };
    // The sustained whistle for the whole time a shell is airborne —
    // quiet, since it plays underneath everything else.
    readonly flight: {
      readonly envelope: Envelope;
      readonly gain: number;
    };
  };
}

export const defaultAudioVisualConfig: AudioVisualConfig = Object.freeze({
  maxFrameMs: 50,
  shellSize: 1.5,
  sparkSize: 0.6,
  sparkSpeed: Object.freeze({ min: 15, max: 40 }),
  trailMaxPoints: 4,
  trailSpacingMs: 40,
  trailMaxAgeMs: 300,
  backdrop: Object.freeze({
    skyMaxBrightness: 0.25,
    starCount: Object.freeze({ min: 18, max: 40 }),
    celestialMinHeight: 35,
  }),
  ascii: Object.freeze({
    columns: 80,
    rows: 40,
    ramp: " .:-=+*#%@",
  }),
  audio: Object.freeze({
    lookaheadMs: 30,
    masterGain: 0.8,
    maxVoices: 16,
    crackleCount: 5,
    burst: Object.freeze({
      envelope: Object.freeze({
        attackMs: 5,
        decayMs: 50,
        sustainLevel: 0.3,
        releaseMs: 200,
      }),
    }),
    launch: Object.freeze({
      durationMs: 200,
      envelope: Object.freeze({
        attackMs: 10,
        decayMs: 0,
        sustainLevel: 1,
        releaseMs: 60,
      }),
    }),
    flight: Object.freeze({
      envelope: Object.freeze({
        attackMs: 100,
        decayMs: 100,
        sustainLevel: 1,
        releaseMs: 150,
      }),
      gain: 0.18,
    }),
  }),
});

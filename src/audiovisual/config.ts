// Rendering and audio tunables for the AudioVisual layer, grown one cycle
// at a time as buildFrame and its neighbours need each field — the same
// discipline src/action/config.ts follows for ActionConfig.

import type { NumberRange } from "../action/config.ts";

export interface AudioVisualConfig {
  // The render loop's elapsed-time clamp. Below the shortest phase Action
  // can produce (100ms at default config), so a phase watcher (cycle 16)
  // never misses a transition, and low enough that a backgrounded tab's
  // catch-up on return never runs an unbounded burst of physics steps in
  // one turn. See "Why the elapsed time is clamped" in
  // docs/05_audio_visual_layer.md.
  readonly maxFrameMs: number;
  readonly shellSize: number; // world units, radius
  readonly sparkSpeed: NumberRange; // world units per second, outward
  // Only the ASCII adapter reads this — nested under its own key for the
  // same reason ControlConfig nests `keyboard`: the shape says who owns it.
  readonly ascii: {
    readonly columns: number;
    readonly rows: number;
    readonly ramp: string; // dimmest to brightest, one character per level
  };
}

export const defaultAudioVisualConfig: AudioVisualConfig = Object.freeze({
  maxFrameMs: 50,
  shellSize: 1.5,
  sparkSpeed: Object.freeze({ min: 15, max: 40 }),
  ascii: Object.freeze({
    columns: 80,
    rows: 40,
    ramp: " .:-=+*#%@",
  }),
});

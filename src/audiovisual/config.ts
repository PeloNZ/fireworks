// Rendering and audio tunables for the AudioVisual layer, grown one cycle
// at a time as buildFrame and its neighbours need each field — the same
// discipline src/action/config.ts follows for ActionConfig.

export interface AudioVisualConfig {
  readonly shellSize: number; // world units, radius
  // Only the ASCII adapter reads this — nested under its own key for the
  // same reason ControlConfig nests `keyboard`: the shape says who owns it.
  readonly ascii: {
    readonly columns: number;
    readonly rows: number;
    readonly ramp: string; // dimmest to brightest, one character per level
  };
}

export const defaultAudioVisualConfig: AudioVisualConfig = Object.freeze({
  shellSize: 1.5,
  ascii: Object.freeze({
    columns: 80,
    rows: 40,
    ramp: " .:-=+*#%@",
  }),
});

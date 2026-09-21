// Rendering and audio tunables for the AudioVisual layer, grown one cycle
// at a time as buildFrame and its neighbours need each field — the same
// discipline src/action/config.ts follows for ActionConfig.

export interface AudioVisualConfig {
  readonly shellSize: number; // world units, radius
}

export const defaultAudioVisualConfig: AudioVisualConfig = Object.freeze({
  shellSize: 1.5,
});

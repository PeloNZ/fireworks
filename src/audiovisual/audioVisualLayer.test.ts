import { describe, expect, it, vi } from "vitest";
import { createAudioVisualLayer } from "./audioVisualLayer.ts";
import { buildFrame } from "./frame.ts";
import { createTrails } from "./trails.ts";
import { planToneVoices } from "./voices/tones.ts";
import { defaultAudioVisualConfig } from "./config.ts";
import { defaultWorldConfig } from "../action/worldConfig.ts";
import type { Firework, FireworkSpec } from "../action/types.ts";
import type { Voice, VoicePlanner } from "./types.ts";

// Cycle 6 (docs/05_audio_visual_layer.md): createAudioVisualLayer wires
// Action's snapshot to a renderer port, one call per frame. Cycle 19
// wires an audio port in too: present() watches for phase transitions
// and turns any cue into voices via a given `voicePlanner`, calling audio
// with the result every time, even when it's empty. Cycle 2
// (docs/08_sound_effects.md) makes that planner a caller-supplied option
// instead of always calling planToneVoices — a sound set swaps this
// argument, not the audio sink.

function fireworkSpec(overrides: Partial<FireworkSpec> = {}): FireworkSpec {
  return {
    id: "KeyA:1000",
    launchedAt: 1000,
    origin: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 10, z: 0 },
    thrust: 0,
    fuelMs: 500,
    fuseMs: 900,
    pattern: "peony",
    colors: ["#ff3b30"],
    particleCount: 60,
    burstDurationMs: 300,
    sound: { pitch: 440, timbre: "soft" },
    seed: 1,
    ...overrides,
  };
}

function firework(overrides: Partial<Firework> = {}): Firework {
  const spec = overrides.spec ?? fireworkSpec();
  return {
    spec,
    phase: "flying",
    position: { x: 5, y: 40, z: 0 },
    previousPosition: { x: 0, y: 30, z: 0 },
    velocity: spec.velocity,
    fuelRemainingMs: spec.fuelMs,
    fuseRemainingMs: spec.fuseMs,
    phaseElapsedMs: 0,
    ...overrides,
  };
}

describe("createAudioVisualLayer", () => {
  it("calls the renderer once per present, with the frame buildFrame would build", () => {
    const renderer = vi.fn();
    const layer = createAudioVisualLayer({
      renderer,
      audio: vi.fn(),
      voicePlanner: planToneVoices,
      config: defaultAudioVisualConfig,
      worldConfig: defaultWorldConfig,
    });
    const entities = [firework()];

    layer.present({ entities, alpha: 0.4, elapsedMs: 16 });

    // present() records into its own trails store before building the
    // frame — an independent instance, fed the same call, reproduces the
    // same trail state to compare against.
    const trails = createTrails({
      maxAgeMs: defaultAudioVisualConfig.trailMaxAgeMs,
      maxPoints: defaultAudioVisualConfig.trailMaxPoints,
    });
    trails.record(entities, 16);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(
      buildFrame({
        entities,
        alpha: 0.4,
        config: defaultAudioVisualConfig,
        worldConfig: defaultWorldConfig,
        trails,
      }),
    );
  });

  it("calls audio with no voices when nothing has transitioned yet", () => {
    const audio = vi.fn();
    const layer = createAudioVisualLayer({
      renderer: vi.fn(),
      audio,
      voicePlanner: planToneVoices,
      config: defaultAudioVisualConfig,
      worldConfig: defaultWorldConfig,
    });

    layer.present({
      entities: [firework({ phase: "flying" })],
      alpha: 0,
      elapsedMs: 16,
    });

    expect(audio).toHaveBeenCalledTimes(1);
    expect(audio).toHaveBeenCalledWith([]);
  });

  it("calls audio with the planned voices when a firework enters exploding", () => {
    const audio = vi.fn();
    const layer = createAudioVisualLayer({
      renderer: vi.fn(),
      audio,
      voicePlanner: planToneVoices,
      config: defaultAudioVisualConfig,
      worldConfig: defaultWorldConfig,
    });
    const spec = fireworkSpec();
    layer.present({
      entities: [firework({ spec, phase: "flying" })],
      alpha: 0,
      elapsedMs: 16,
    });

    layer.present({
      entities: [firework({ spec, phase: "exploding" })],
      alpha: 0,
      elapsedMs: 16,
    });

    expect(audio).toHaveBeenCalledTimes(2);
    expect(audio).toHaveBeenNthCalledWith(
      2,
      planToneVoices({ kind: "burst", spec }, defaultAudioVisualConfig),
    );
  });

  it("plans voices with the given voicePlanner, not one it imports itself", () => {
    const audio = vi.fn();
    const fakeVoice: Voice = {
      kind: "tone",
      waveform: "square",
      frequencyHz: 999,
      frequencyEndHz: null,
      durationMs: 1,
      envelope: { attackMs: 0, decayMs: 0, sustainLevel: 1, releaseMs: 0 },
      gain: 1,
      seed: 0,
      filter: null,
      startOffsetMs: 0,
      pitchLfo: null,
      filterLfo: null,
      effect: null,
    };
    const voicePlanner: VoicePlanner = vi.fn(() => [fakeVoice]);
    const layer = createAudioVisualLayer({
      renderer: vi.fn(),
      audio,
      voicePlanner,
      config: defaultAudioVisualConfig,
      worldConfig: defaultWorldConfig,
    });
    const spec = fireworkSpec();
    layer.present({
      entities: [firework({ spec, phase: "flying" })],
      alpha: 0,
      elapsedMs: 16,
    });

    layer.present({
      entities: [firework({ spec, phase: "exploding" })],
      alpha: 0,
      elapsedMs: 16,
    });

    expect(voicePlanner).toHaveBeenCalledWith(
      { kind: "burst", spec },
      defaultAudioVisualConfig,
    );
    expect(audio).toHaveBeenNthCalledWith(2, [fakeVoice]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createWebAudioSink } from "./webAudio.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Voice } from "../types.ts";

// Cycle 18 (docs/05_audio_visual_layer.md): the adapter that actually
// makes sound. Tested against a fake AudioContext — a plain object
// shaped like the slice of the real one this sink uses (createOscillator,
// createGain, currentTime, destination), the same "port" pattern
// createKeyboardAdapter's KeyEventLike uses. No jsdom, no real audio.

// Records every setValueAtTime/linearRampToValueAtTime call, in order, as
// plain data — simpler to assert an exact sequence against than two
// separate vi.fn() spies, which can't prove relative call order to each
// other.
function fakeAudioParam(): {
  readonly calls: { method: string; value: number; time: number }[];
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
} {
  const calls: { method: string; value: number; time: number }[] = [];
  return {
    calls,
    setValueAtTime(value, time) {
      calls.push({ method: "setValueAtTime", value, time });
    },
    linearRampToValueAtTime(value, time) {
      calls.push({ method: "linearRampToValueAtTime", value, time });
    },
  };
}

function fakeContext(currentTime: number) {
  const oscillators: ReturnType<typeof fakeOscillator>[] = [];
  const gains: ReturnType<typeof fakeGain>[] = [];
  const destination = { connect: vi.fn() };

  function fakeOscillator() {
    return {
      frequency: fakeAudioParam(),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  function fakeGain() {
    return {
      gain: fakeAudioParam(),
      connect: vi.fn(),
    };
  }

  const context = {
    currentTime,
    destination,
    createOscillator: vi.fn(() => {
      const oscillator = fakeOscillator();
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => {
      const gain = fakeGain();
      gains.push(gain);
      return gain;
    }),
  };

  return { context, oscillators, gains, destination };
}

const toneVoice: Voice = {
  kind: "tone",
  frequencyHz: 440,
  frequencyEndHz: null,
  durationMs: 1000,
  envelope: { attackMs: 10, decayMs: 20, sustainLevel: 0.5, releaseMs: 100 },
};

// An unusual lookahead/gain/cap, not the defaults, so hardcoded values
// can't pass.
const config = {
  ...defaultAudioVisualConfig,
  audio: {
    ...defaultAudioVisualConfig.audio,
    lookaheadMs: 20,
    masterGain: 0.7,
    maxVoices: 2,
  },
};

describe("createWebAudioSink", () => {
  it("connects a tone voice's node chain: oscillator -> its gain -> master gain -> destination", () => {
    const { context, oscillators, gains, destination } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });

    sink([toneVoice]);

    // gains[0] is the master gain, created once at sink-creation time;
    // gains[1] is this voice's own gain.
    expect(gains).toHaveLength(2);
    const [master, voiceGain] = gains;
    expect(master?.connect).toHaveBeenCalledWith(destination);
    expect(oscillators[0]?.connect).toHaveBeenCalledWith(voiceGain);
    expect(voiceGain?.connect).toHaveBeenCalledWith(master);
  });

  it("sets the master gain to config.audio.masterGain once, at creation", () => {
    const { context, gains } = fakeContext(10);

    createWebAudioSink({ context, config });

    expect(gains).toHaveLength(1);
    expect(gains[0]?.gain.calls).toEqual([
      { method: "setValueAtTime", value: 0.7, time: 10 },
    ]);
  });

  it("schedules a voice to start at currentTime + lookaheadMs and stop lookaheadMs + durationMs later", () => {
    const { context, oscillators } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });

    sink([toneVoice]);

    // lookaheadMs=20 -> 0.02s; durationMs=1000 -> 1s.
    expect(oscillators[0]?.start).toHaveBeenCalledWith(10.02);
    expect(oscillators[0]?.stop).toHaveBeenCalledWith(11.02);
    expect(oscillators[0]?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 440, time: 10.02 },
    ]);
  });

  it("schedules the envelope's four stages on the voice's own gain, in order", () => {
    const { context, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });

    sink([toneVoice]);

    const voiceGain = gains[1];
    // Computed the same way the implementation accumulates them, not as
    // rounded decimal literals — 10.02 + 0.01 + 0.02 doesn't land on
    // exactly 10.05 in floating point, and that's not a bug to work
    // around with a literal that happens to differ in its last bit.
    const startTime = 10 + config.audio.lookaheadMs / 1000;
    const attackEnd = startTime + toneVoice.envelope.attackMs / 1000;
    const decayEnd = attackEnd + toneVoice.envelope.decayMs / 1000;
    const endTime = startTime + toneVoice.durationMs / 1000;
    const releaseStart = endTime - toneVoice.envelope.releaseMs / 1000;
    expect(voiceGain?.gain.calls).toEqual([
      { method: "setValueAtTime", value: 0, time: startTime },
      { method: "linearRampToValueAtTime", value: 1, time: attackEnd },
      {
        method: "linearRampToValueAtTime",
        value: toneVoice.envelope.sustainLevel,
        time: decayEnd,
      },
      {
        method: "setValueAtTime",
        value: toneVoice.envelope.sustainLevel,
        time: releaseStart,
      },
      { method: "linearRampToValueAtTime", value: 0, time: endTime },
    ]);
  });

  it("drops voices beyond config.audio.maxVoices", () => {
    const { context, oscillators } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });

    sink([toneVoice, toneVoice, toneVoice]);

    expect(oscillators).toHaveLength(2);
  });
});

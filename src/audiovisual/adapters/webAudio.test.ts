import { describe, expect, it, vi } from "vitest";
import { createNoiseBuffer, createWebAudioSink } from "./webAudio.ts";
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

function fakeContext(currentTime: number, sampleRate = 44100) {
  const oscillators: ReturnType<typeof fakeOscillator>[] = [];
  const gains: ReturnType<typeof fakeGain>[] = [];
  const buffers: ReturnType<typeof fakeBuffer>[] = [];
  const bufferSources: ReturnType<typeof fakeBufferSource>[] = [];
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
  function fakeBuffer(length: number, sr: number) {
    const channelData = new Float32Array(length);
    return {
      length,
      sampleRate: sr,
      getChannelData: () => channelData,
    };
  }
  function fakeBufferSource() {
    return {
      buffer: null as ReturnType<typeof fakeBuffer> | null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  const context = {
    currentTime,
    sampleRate,
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
    createBuffer: vi.fn(
      (_numberOfChannels: number, length: number, sr: number) => {
        const buffer = fakeBuffer(length, sr);
        buffers.push(buffer);
        return buffer;
      },
    ),
    createBufferSource: vi.fn(() => {
      const source = fakeBufferSource();
      bufferSources.push(source);
      return source;
    }),
  };

  return { context, oscillators, gains, buffers, bufferSources, destination };
}

const toneVoice: Voice = {
  kind: "tone",
  frequencyHz: 440,
  frequencyEndHz: null,
  durationMs: 1000,
  envelope: { attackMs: 10, decayMs: 20, sustainLevel: 0.5, releaseMs: 100 },
  seed: 1,
};

const noiseVoice: Voice = {
  kind: "noise",
  frequencyHz: 200,
  frequencyEndHz: 900,
  durationMs: 300,
  envelope: { attackMs: 5, decayMs: 5, sustainLevel: 0.8, releaseMs: 50 },
  seed: 7,
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

  // Cycle 21: a "noise" voice plays through a buffer source instead of an
  // oscillator, connected through the same gain chain.
  it("plays a noise voice through a buffer source, not an oscillator, connected the same way", () => {
    const { context, oscillators, bufferSources, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });

    sink([noiseVoice]);

    expect(oscillators).toHaveLength(0);
    expect(bufferSources).toHaveLength(1);
    expect(bufferSources[0]?.buffer).not.toBeNull();
    const [master, voiceGain] = gains;
    expect(bufferSources[0]?.connect).toHaveBeenCalledWith(voiceGain);
    expect(voiceGain?.connect).toHaveBeenCalledWith(master);
  });

  it("builds a noise voice's buffer from its own seed and duration", () => {
    const { context, buffers } = fakeContext(10, 8000);
    const sink = createWebAudioSink({ context, config });

    sink([noiseVoice]);

    expect(context.createBuffer).toHaveBeenCalledWith(1, 2400, 8000); // 0.3s * 8000
    // An independent context and call, fed the voice's own seed and
    // duration, reproduces the same noise — proving the sink used those
    // values, not some other seed or a fixed duration.
    const { context: independentContext } = fakeContext(0, 8000);
    const expected = createNoiseBuffer(
      independentContext,
      noiseVoice.seed,
      noiseVoice.durationMs,
    );
    expect(buffers[0]?.getChannelData()).toEqual(expected.getChannelData(0));
  });
});

describe("createNoiseBuffer", () => {
  it("requests a mono buffer sized for durationMs at context.sampleRate", () => {
    const { context } = fakeContext(0, 44100);

    createNoiseBuffer(context, 1, 500);

    expect(context.createBuffer).toHaveBeenCalledWith(1, 22050, 44100);
  });

  it("fills the buffer deterministically from the seed", () => {
    const { context: contextA } = fakeContext(0, 8000);
    const { context: contextB } = fakeContext(0, 8000);

    const bufferA = createNoiseBuffer(contextA, 42, 10);
    const bufferB = createNoiseBuffer(contextB, 42, 10);

    expect(Array.from(bufferA.getChannelData(0))).toEqual(
      Array.from(bufferB.getChannelData(0)),
    );
  });

  it("gives different seeds different noise", () => {
    const { context: contextA } = fakeContext(0, 8000);
    const { context: contextB } = fakeContext(0, 8000);

    const bufferA = createNoiseBuffer(contextA, 1, 10);
    const bufferB = createNoiseBuffer(contextB, 2, 10);

    expect(Array.from(bufferA.getChannelData(0))).not.toEqual(
      Array.from(bufferB.getChannelData(0)),
    );
  });
});

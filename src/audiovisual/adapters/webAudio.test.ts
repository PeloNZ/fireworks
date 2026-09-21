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
  const filters: ReturnType<typeof fakeFilter>[] = [];
  const destination = { connect: vi.fn() };

  function fakeOscillator() {
    return {
      type: "",
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
  function fakeFilter() {
    return {
      type: "",
      frequency: fakeAudioParam(),
      Q: fakeAudioParam(),
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
    createBiquadFilter: vi.fn(() => {
      const filter = fakeFilter();
      filters.push(filter);
      return filter;
    }),
  };

  return {
    context,
    oscillators,
    gains,
    buffers,
    bufferSources,
    filters,
    destination,
  };
}

const toneVoice: Voice = {
  kind: "tone",
  waveform: "sine",
  frequencyHz: 440,
  frequencyEndHz: null,
  durationMs: 1000,
  envelope: { attackMs: 10, decayMs: 20, sustainLevel: 0.5, releaseMs: 100 },
  gain: 1,
  seed: 1,
  filter: null,
  startOffsetMs: 0,
};

const noiseVoice: Voice = {
  kind: "noise",
  waveform: "sine",
  frequencyHz: 200,
  frequencyEndHz: 900,
  durationMs: 300,
  envelope: { attackMs: 5, decayMs: 5, sustainLevel: 0.8, releaseMs: 50 },
  gain: 1,
  seed: 7,
  filter: null,
  startOffsetMs: 0,
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

describe("createWebAudioSink — cycle 22 (filter and startOffsetMs)", () => {
  it("inserts a filter node between the source and its gain when the voice has one", () => {
    const { context, oscillators, filters, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const filtered: Voice = {
      ...toneVoice,
      filter: { kind: "lowpass", frequencyHz: 500, q: 3 },
    };

    sink([filtered]);

    expect(filters).toHaveLength(1);
    const [master, voiceGain] = gains;
    expect(oscillators[0]?.connect).toHaveBeenCalledWith(filters[0]);
    expect(filters[0]?.connect).toHaveBeenCalledWith(voiceGain);
    expect(voiceGain?.connect).toHaveBeenCalledWith(master);
    expect(filters[0]?.type).toBe("lowpass");
    expect(filters[0]?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 500, time: 10.02 },
    ]);
    expect(filters[0]?.Q.calls).toEqual([
      { method: "setValueAtTime", value: 3, time: 10.02 },
    ]);
  });

  it("connects the source directly to its gain when the voice has no filter", () => {
    const { context, filters } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });

    sink([toneVoice]);

    expect(filters).toHaveLength(0);
  });

  it("schedules a voice with startOffsetMs later than lookaheadMs alone", () => {
    const { context, oscillators } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const delayed: Voice = { ...toneVoice, startOffsetMs: 50 };

    sink([delayed]);

    // lookaheadMs=20 -> 0.02s, startOffsetMs=50 -> 0.05s.
    expect(oscillators[0]?.start).toHaveBeenCalledWith(10.07);
  });
});

// Playtesting a finished build found real bugs unit tests couldn't catch
// on their own: "sharp"/"crackle" bursts were inaudible (fixed in
// voices.ts, not here — a filter genuinely centred on a sine's only
// frequency does nothing, so this layer's node-graph tests never showed
// it), and frequencyEndHz — the field meant to make a sound rise — had
// never actually been scheduled anywhere.
describe("createWebAudioSink — playtesting fixes", () => {
  it("sets the oscillator's waveform from voice.waveform", () => {
    const { context, oscillators } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });

    sink([{ ...toneVoice, waveform: "sawtooth" }]);

    expect(oscillators[0]?.type).toBe("sawtooth");
  });

  it("scales the envelope's peak to voice.gain instead of always hitting full scale", () => {
    const { context, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const quiet: Voice = { ...toneVoice, gain: 0.25 };

    sink([quiet]);

    const voiceGain = gains[1];
    const peakCall = voiceGain?.gain.calls[1];
    expect(peakCall?.method).toBe("linearRampToValueAtTime");
    expect(peakCall?.value).toBe(0.25);
    // Sustain is a fraction of gain, not of full scale.
    const sustainCall = voiceGain?.gain.calls[2];
    expect(sustainCall?.value).toBeCloseTo(
      0.25 * toneVoice.envelope.sustainLevel,
    );
  });

  it("glides a tone voice's oscillator frequency toward frequencyEndHz over its duration", () => {
    const { context, oscillators } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const gliding: Voice = { ...toneVoice, frequencyEndHz: 880 };

    sink([gliding]);

    // startTime=10.02, durationMs=1000 -> endTime=11.02.
    expect(oscillators[0]?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 440, time: 10.02 },
      { method: "linearRampToValueAtTime", value: 880, time: 11.02 },
    ]);
  });

  it("glides a noise voice's filter cutoff toward frequencyEndHz, since noise has no pitch of its own", () => {
    const { context, filters } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const gliding: Voice = {
      ...noiseVoice,
      filter: { kind: "lowpass", frequencyHz: 200, q: 1 },
      frequencyEndHz: 900,
      durationMs: 1000,
    };

    sink([gliding]);

    expect(filters[0]?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 200, time: 10.02 },
      { method: "linearRampToValueAtTime", value: 900, time: 11.02 },
    ]);
  });

  it("never schedules a frequency above 16kHz, the ceiling of what's audible", () => {
    const { context, oscillators, filters } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const tooHigh: Voice = {
      ...toneVoice,
      frequencyHz: 20000,
      frequencyEndHz: 30000,
      filter: { kind: "lowpass", frequencyHz: 25000, q: 1 },
    };

    sink([tooHigh]);

    expect(oscillators[0]?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 16000, time: 10.02 },
      { method: "linearRampToValueAtTime", value: 16000, time: 11.02 },
    ]);
    expect(filters[0]?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 16000, time: 10.02 },
    ]);
  });
});

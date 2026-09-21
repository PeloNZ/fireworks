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
  const delays: ReturnType<typeof fakeDelay>[] = [];
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
  function fakeDelay() {
    return {
      delayTime: fakeAudioParam(),
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
    createDelay: vi.fn(() => {
      const delay = fakeDelay();
      delays.push(delay);
      return delay;
    }),
  };

  return {
    context,
    oscillators,
    gains,
    buffers,
    bufferSources,
    filters,
    delays,
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
  pitchLfo: null,
  filterLfo: null,
  effect: null,
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
  pitchLfo: null,
  filterLfo: null,
  effect: null,
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
// voices/tones.ts, not here — a filter genuinely centred on a sine's only
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

  it("adds a pitch LFO wobbling a tone voice's own frequency, on the voice's own clock", () => {
    const { context, oscillators, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const wobbly: Voice = {
      ...toneVoice,
      pitchLfo: { rateHz: 6, depth: 30 },
    };

    sink([wobbly]);

    // oscillators[0] is the tone; oscillators[1] is the LFO.
    expect(oscillators).toHaveLength(2);
    const lfo = oscillators[1];
    expect(lfo?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 6, time: 10.02 },
    ]);
    // Started and stopped on the voice's own clock — a forgotten start()
    // gives silent modulation and throws no error, so this is asserted
    // explicitly rather than assumed.
    expect(lfo?.start).toHaveBeenCalledWith(10.02);
    expect(lfo?.stop).toHaveBeenCalledWith(11.02);

    // gains: [0] master, [1] the LFO's own depth gain (built while the
    // tone source is still being built), [2] the voice's own gain.
    expect(gains).toHaveLength(3);
    const depth = gains[1];
    expect(depth?.gain.calls).toEqual([
      { method: "setValueAtTime", value: 30, time: 10.02 },
    ]);
    expect(lfo?.connect).toHaveBeenCalledWith(depth);
    expect(depth?.connect).toHaveBeenCalledWith(oscillators[0]?.frequency);
  });

  it("adds no LFO machinery when pitchLfo is null", () => {
    const { context, oscillators, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });

    sink([toneVoice]);

    expect(oscillators).toHaveLength(1);
    expect(gains).toHaveLength(2);
  });

  it("adds a filter LFO wobbling a voice's own filter cutoff", () => {
    const { context, oscillators, filters, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const wahWah: Voice = {
      ...toneVoice,
      filter: { kind: "lowpass", frequencyHz: 500, q: 3 },
      filterLfo: { rateHz: 2, depth: 200 },
    };

    sink([wahWah]);

    // oscillators[0] is the tone; oscillators[1] is the filter LFO.
    expect(oscillators).toHaveLength(2);
    const lfo = oscillators[1];
    expect(lfo?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 2, time: 10.02 },
    ]);
    expect(lfo?.start).toHaveBeenCalledWith(10.02);
    expect(lfo?.stop).toHaveBeenCalledWith(11.02);

    // gains: [0] master, [1] voice gain (created before the filter node,
    // unlike a pitch LFO's depth gain), [2] the filter LFO's depth gain.
    expect(gains).toHaveLength(3);
    const depth = gains[2];
    expect(depth?.gain.calls).toEqual([
      { method: "setValueAtTime", value: 200, time: 10.02 },
    ]);
    expect(lfo?.connect).toHaveBeenCalledWith(depth);
    expect(depth?.connect).toHaveBeenCalledWith(filters[0]?.frequency);
  });

  it("builds no filter LFO when the voice has no filter, even if filterLfo is set", () => {
    const { context, oscillators, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const noFilter: Voice = {
      ...toneVoice,
      filter: null,
      filterLfo: { rateHz: 2, depth: 200 },
    };

    sink([noFilter]);

    expect(oscillators).toHaveLength(1);
    expect(gains).toHaveLength(2);
  });

  it("chains a phaser's allpass stages between the filter and the voice gain, mixed with dry, swept by one shared LFO", () => {
    const { context, oscillators, filters, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const phased: Voice = {
      ...toneVoice,
      filter: { kind: "lowpass", frequencyHz: 500, q: 1 },
      effect: {
        kind: "phaser",
        stages: 3,
        baseHz: 800,
        lfo: { rateHz: 0.5, depth: 300 },
      },
    };

    sink([phased]);

    // filters[0] is the voice's own declared filter; [1..3] are the
    // three allpass stages, in series.
    expect(filters).toHaveLength(4);
    const [mainFilter, stage1, stage2, stage3] = filters;
    for (const stage of [stage1, stage2, stage3]) {
      expect(stage?.type).toBe("allpass");
      expect(stage?.frequency.calls[0]).toEqual({
        method: "setValueAtTime",
        value: 800,
        time: 10.02,
      });
    }

    // oscillators[0] is the tone; [1] is the phaser's own shared LFO.
    expect(oscillators).toHaveLength(2);
    const lfo = oscillators[1];
    expect(lfo?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 0.5, time: 10.02 },
    ]);
    expect(lfo?.start).toHaveBeenCalledWith(10.02);
    expect(lfo?.stop).toHaveBeenCalledWith(11.02);

    // gains: [0] master, [1] voice gain, [2] the phaser's fan-out
    // (input), [3] its convergence point (output), [4] the shared LFO's
    // own depth gain.
    expect(gains).toHaveLength(5);
    const [, voiceGain, input, output, depth] = gains;
    expect(depth?.gain.calls).toEqual([
      { method: "setValueAtTime", value: 300, time: 10.02 },
    ]);
    // One LFO, connected into every stage's own frequency — not a
    // separate LFO per stage.
    expect(lfo?.connect).toHaveBeenCalledWith(depth);
    expect(depth?.connect).toHaveBeenCalledWith(stage1?.frequency);
    expect(depth?.connect).toHaveBeenCalledWith(stage2?.frequency);
    expect(depth?.connect).toHaveBeenCalledWith(stage3?.frequency);

    // The voice's own filter feeds the phaser's input.
    expect(mainFilter?.connect).toHaveBeenCalledWith(input);
    // Dry path: input straight to output.
    expect(input?.connect).toHaveBeenCalledWith(output);
    // Wet path: input through every stage in series, to output.
    expect(input?.connect).toHaveBeenCalledWith(stage1);
    expect(stage1?.connect).toHaveBeenCalledWith(stage2);
    expect(stage2?.connect).toHaveBeenCalledWith(stage3);
    expect(stage3?.connect).toHaveBeenCalledWith(output);
    // The effect sits between the filter and the voice's own gain.
    expect(output?.connect).toHaveBeenCalledWith(voiceGain);
  });

  it("builds no effect machinery when effect is null", () => {
    const { context, oscillators, filters, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });

    sink([toneVoice]);

    expect(oscillators).toHaveLength(1);
    expect(filters).toHaveLength(0);
    expect(gains).toHaveLength(2);
  });

  it("ring modulates through a gain node scheduled to zero, driven by a modulator oscillator", () => {
    const { context, oscillators, gains } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const ringModded: Voice = {
      ...toneVoice,
      effect: { kind: "ringmod", frequencyHz: 730 },
    };

    sink([ringModded]);

    // oscillators[0] is the tone; [1] is the modulator.
    expect(oscillators).toHaveLength(2);
    const [tone, modulator] = oscillators;
    expect(modulator?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 730, time: 10.02 },
    ]);
    expect(modulator?.start).toHaveBeenCalledWith(10.02);
    expect(modulator?.stop).toHaveBeenCalledWith(11.02);

    // gains: [0] master, [1] voice gain, [2] the ring — its own gain
    // scheduled to zero at the voice's own start. Scheduling zero, not
    // one, is what makes this multiplication rather than a fixed-volume
    // pass-through: the ring's whole output comes from the modulator.
    expect(gains).toHaveLength(3);
    const ring = gains[2];
    expect(ring?.gain.calls).toEqual([
      { method: "setValueAtTime", value: 0, time: 10.02 },
    ]);
    expect(modulator?.connect).toHaveBeenCalledWith(ring?.gain);

    // No dry path: the ring node is both the effect's input and its
    // output, unlike a phaser's separate fan-out and convergence points.
    expect(tone?.connect).toHaveBeenCalledWith(ring);
    expect(ring?.connect).toHaveBeenCalledWith(gains[1]);
  });

  it("flanges: dry mixed with a delayed, fed-back copy, the delay time swept by one LFO", () => {
    const { context, oscillators, gains, delays } = fakeContext(10);
    const sink = createWebAudioSink({ context, config });
    const flanged: Voice = {
      ...toneVoice,
      effect: {
        kind: "flanger",
        delayMs: 3,
        feedback: 0.5,
        lfo: { rateHz: 0.4, depth: 0.002 },
      },
    };

    sink([flanged]);

    // One delay line, its time set from delayMs converted to seconds.
    expect(delays).toHaveLength(1);
    const delay = delays[0];
    expect(delay?.delayTime.calls[0]).toEqual({
      method: "setValueAtTime",
      value: 0.003,
      time: 10.02,
    });

    // oscillators[0] is the tone; [1] is the LFO sweeping the delay.
    expect(oscillators).toHaveLength(2);
    const [tone, lfo] = oscillators;
    expect(lfo?.frequency.calls).toEqual([
      { method: "setValueAtTime", value: 0.4, time: 10.02 },
    ]);
    expect(lfo?.start).toHaveBeenCalledWith(10.02);
    expect(lfo?.stop).toHaveBeenCalledWith(11.02);

    // gains: [0] master, [1] voice gain, [2] input (fan-out), [3] output
    // (convergence), [4] feedback, [5] the LFO's own depth gain.
    expect(gains).toHaveLength(6);
    const [, voiceGain, input, output, feedback, depth] = gains;
    expect(feedback?.gain.calls).toEqual([
      { method: "setValueAtTime", value: 0.5, time: 10.02 },
    ]);
    expect(depth?.gain.calls).toEqual([
      { method: "setValueAtTime", value: 0.002, time: 10.02 },
    ]);
    expect(lfo?.connect).toHaveBeenCalledWith(depth);
    expect(depth?.connect).toHaveBeenCalledWith(delay?.delayTime);

    // Dry path: input straight to output.
    expect(input?.connect).toHaveBeenCalledWith(output);
    // Wet path: input into the delay, delay into output.
    expect(input?.connect).toHaveBeenCalledWith(delay);
    expect(delay?.connect).toHaveBeenCalledWith(output);
    // The feedback loop: some of the delayed signal fed back into the
    // delay's own input, deepening the notches.
    expect(delay?.connect).toHaveBeenCalledWith(feedback);
    expect(feedback?.connect).toHaveBeenCalledWith(delay);

    // The voice's own source feeds the effect's input, and the effect's
    // output feeds the voice's own gain.
    expect(tone?.connect).toHaveBeenCalledWith(input);
    expect(output?.connect).toHaveBeenCalledWith(voiceGain);
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

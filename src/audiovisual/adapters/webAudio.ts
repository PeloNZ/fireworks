import { createRandom } from "../../action/random.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { AudioSink, Voice } from "../types.ts";

/**
 * The minimal slice of a real `AudioParam` this sink needs — a "port",
 * the same pattern `createKeyboardAdapter`'s `KeyEventLike` uses. Not
 * exported: nothing outside this file names it directly, only through
 * `AudioContextLike`.
 */
interface AudioParamLike {
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
}

/** The minimal slice of a real `AudioNode` this sink needs: something it
 * can connect another node into. */
interface AudioNodeLike {
  connect(destination: AudioNodeLike): void;
}

interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

/** Either a tone's oscillator or a noise voice's buffer source — both are
 * played the same way: start once, stop once. */
interface SourceNodeLike extends AudioNodeLike {
  start(when: number): void;
  stop(when: number): void;
}

interface OscillatorNodeLike extends SourceNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
}

/** The minimal slice of a real `AudioBuffer` this sink needs: somewhere
 * to write noise samples. */
interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

interface BufferSourceNodeLike extends SourceNodeLike {
  buffer: AudioBufferLike | null;
}

interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
}

/** The minimal slice of a real `AudioContext` this sink needs. A real
 * `AudioContext` satisfies this; tests use a plain object instead. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  createBufferSource(): BufferSourceNodeLike;
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): AudioBufferLike;
  createBiquadFilter(): BiquadFilterNodeLike;
}

// Roughly the top of adult human hearing, and comfortably past where
// most adults' hearing has already rolled off — a frequency requested
// above this is inaudible to a lot of people, not just quiet. Nothing
// this layer plans exceeds it today, but nothing here trusts that to
// stay true either.
const MAX_AUDIBLE_HZ = 16000;

function clampAudible(hz: number): number {
  return Math.min(hz, MAX_AUDIBLE_HZ);
}

/**
 * Builds a mono buffer of white noise, deterministic per `seed` — the
 * same seed always produces the same noise, so a firework's whoosh sounds
 * the same every time it's replayed. Filled from `createRandom`, not
 * `Math.random()`, the same rule every other seeded value in this project
 * follows.
 */
export function createNoiseBuffer(
  context: AudioContextLike,
  seed: number,
  durationMs: number,
): AudioBufferLike {
  const length = Math.round((durationMs / 1000) * context.sampleRate);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  const random = createRandom(seed);
  for (let i = 0; i < length; i++) {
    channel[i] = random() * 2 - 1;
  }
  return buffer;
}

/**
 * Schedules a frequency at `startTime`, and — if `endHz` is given — a
 * linear ramp to it by `startTime + durationSeconds`. Every value is
 * clamped to `MAX_AUDIBLE_HZ` first. Shared by an oscillator's own pitch
 * and a filter's cutoff: whichever parameter is the one actually meant
 * to glide for a given voice.
 */
function scheduleFrequency(
  param: AudioParamLike,
  startHz: number,
  endHz: number | null,
  startTime: number,
  durationSeconds: number,
): void {
  param.setValueAtTime(clampAudible(startHz), startTime);
  if (endHz !== null) {
    param.linearRampToValueAtTime(
      clampAudible(endHz),
      startTime + durationSeconds,
    );
  }
}

function scheduleEnvelope(
  gain: AudioParamLike,
  envelope: Voice["envelope"],
  peak: number,
  startTime: number,
  durationSeconds: number,
): void {
  const attackEnd = startTime + envelope.attackMs / 1000;
  const decayEnd = attackEnd + envelope.decayMs / 1000;
  const endTime = startTime + durationSeconds;
  const releaseStart = endTime - envelope.releaseMs / 1000;
  const sustain = peak * envelope.sustainLevel;

  gain.setValueAtTime(0, startTime);
  gain.linearRampToValueAtTime(peak, attackEnd);
  gain.linearRampToValueAtTime(sustain, decayEnd);
  gain.setValueAtTime(sustain, releaseStart);
  gain.linearRampToValueAtTime(0, endTime);
}

function createToneSource(
  context: AudioContextLike,
  voice: Voice,
  startTime: number,
  durationSeconds: number,
): SourceNodeLike {
  const oscillator = context.createOscillator();
  oscillator.type = voice.waveform;
  scheduleFrequency(
    oscillator.frequency,
    voice.frequencyHz,
    voice.frequencyEndHz,
    startTime,
    durationSeconds,
  );
  return oscillator;
}

function createNoiseSource(
  context: AudioContextLike,
  voice: Voice,
): SourceNodeLike {
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, voice.seed, voice.durationMs);
  return source;
}

/**
 * A voice's filter, if it has one. A `"tone"`'s own pitch is what glides
 * (scheduled in `createToneSource`), so this filter's cutoff, if set, stays
 * static. A `"noise"` voice has no pitch of its own — if it wants to
 * rise, this filter's cutoff is the only thing that can, so it glides
 * from `filter.frequencyHz` to `voice.frequencyEndHz` when that's set.
 */
function createFilterNode(
  context: AudioContextLike,
  voice: Voice,
  startTime: number,
  durationSeconds: number,
): BiquadFilterNodeLike {
  const { filter } = voice;
  if (!filter) {
    // Only called when voice.filter is truthy — see playVoice.
    throw new Error("unreachable: createFilterNode called without a filter");
  }
  const node = context.createBiquadFilter();
  node.type = filter.kind;
  if (voice.kind === "noise") {
    scheduleFrequency(
      node.frequency,
      filter.frequencyHz,
      voice.frequencyEndHz,
      startTime,
      durationSeconds,
    );
  } else {
    node.frequency.setValueAtTime(clampAudible(filter.frequencyHz), startTime);
  }
  node.Q.setValueAtTime(filter.q, startTime);
  return node;
}

function playVoice(
  context: AudioContextLike,
  master: GainNodeLike,
  voice: Voice,
  startTime: number,
): void {
  const durationSeconds = voice.durationMs / 1000;
  const source =
    voice.kind === "tone"
      ? createToneSource(context, voice, startTime, durationSeconds)
      : createNoiseSource(context, voice);

  const gain = context.createGain();
  if (voice.filter) {
    const filterNode = createFilterNode(
      context,
      voice,
      startTime,
      durationSeconds,
    );
    source.connect(filterNode);
    filterNode.connect(gain);
  } else {
    source.connect(gain);
  }
  gain.connect(master);
  scheduleEnvelope(
    gain.gain,
    voice.envelope,
    voice.gain,
    startTime,
    durationSeconds,
  );

  source.start(startTime);
  source.stop(startTime + durationSeconds);
}

/**
 * Builds an `AudioSink` that actually makes sound. Every voice funnels
 * through one shared master gain node, created once and connected to
 * `context.destination` — set to `config.audio.masterGain` so overall
 * volume is controlled in one place. Voices beyond `config.audio.maxVoices`
 * are dropped, not queued, so a burst of simultaneous fireworks can't
 * schedule an unbounded pile of sound. Each voice is scheduled to start
 * `config.audio.lookaheadMs` ahead of `context.currentTime`, giving the
 * audio thread room to start it exactly on time.
 */
export function createWebAudioSink(options: {
  readonly context: AudioContextLike;
  readonly config: AudioVisualConfig;
}): AudioSink {
  const { context, config } = options;
  const master = context.createGain();
  master.gain.setValueAtTime(config.audio.masterGain, context.currentTime);
  master.connect(context.destination);

  return (voices) => {
    const baseStartTime = context.currentTime + config.audio.lookaheadMs / 1000;
    for (const voice of voices.slice(0, config.audio.maxVoices)) {
      const startTime = baseStartTime + voice.startOffsetMs / 1000;
      playVoice(context, master, voice, startTime);
    }
  };
}

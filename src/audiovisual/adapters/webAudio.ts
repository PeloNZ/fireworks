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

interface OscillatorNodeLike extends AudioNodeLike {
  readonly frequency: AudioParamLike;
  start(when: number): void;
  stop(when: number): void;
}

/** The minimal slice of a real `AudioContext` this sink needs. A real
 * `AudioContext` satisfies this; tests use a plain object instead. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
}

function scheduleEnvelope(
  gain: AudioParamLike,
  envelope: Voice["envelope"],
  startTime: number,
  durationSeconds: number,
): void {
  const attackEnd = startTime + envelope.attackMs / 1000;
  const decayEnd = attackEnd + envelope.decayMs / 1000;
  const endTime = startTime + durationSeconds;
  const releaseStart = endTime - envelope.releaseMs / 1000;

  gain.setValueAtTime(0, startTime);
  gain.linearRampToValueAtTime(1, attackEnd);
  gain.linearRampToValueAtTime(envelope.sustainLevel, decayEnd);
  gain.setValueAtTime(envelope.sustainLevel, releaseStart);
  gain.linearRampToValueAtTime(0, endTime);
}

function playTone(
  context: AudioContextLike,
  master: GainNodeLike,
  voice: Voice,
  startTime: number,
): void {
  const durationSeconds = voice.durationMs / 1000;

  const oscillator = context.createOscillator();
  oscillator.frequency.setValueAtTime(voice.frequencyHz, startTime);

  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(master);
  scheduleEnvelope(gain.gain, voice.envelope, startTime, durationSeconds);

  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds);
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
    const startTime = context.currentTime + config.audio.lookaheadMs / 1000;
    for (const voice of voices.slice(0, config.audio.maxVoices)) {
      if (voice.kind === "tone") {
        playTone(context, master, voice, startTime);
      }
      // "noise" voices arrive in cycle 20/21 — nothing plans one yet.
    }
  };
}

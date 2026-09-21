import type { ControlSignal } from "../control/types.ts";
import type { Seeds } from "./types.ts";

// FNV-1a, 32-bit. Not cryptographic — the point is a fast, well-known
// algorithm that gives a stable, well-distributed number for a short
// string, so the same key id always seeds the same "family" of choices.
// See docs/04_plan_action_layer.md's "Seeded randomness".
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/** Hashes `text` into a 32-bit unsigned integer. Pure: the same string
 * always returns the same number, on any machine. */
export function hashString(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Builds a mulberry32 generator: a small, fast pseudo-random number
 * generator seeded with one integer. Not cryptographic — the point is
 * "same seed, same sequence, forever," which is what makes a firework's
 * look replayable from its seed alone. Each call returns the next value in
 * `[0, 1)` and advances the generator's internal state.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derives the two seeds every trait picker branches on, from a signal
 * alone — no randomness, no state. `key` hashes only `signal.id`, so it's
 * identical across every press of the same physical key. `press` hashes
 * `id` plus the floored timestamp, so it's different for every press, but
 * two timestamps that differ only in their fractional millisecond hash the
 * same way — see "Seeded randomness" in docs/04_plan_action_layer.md for
 * why that floor matters for the multiplayer seam.
 */
export function deriveSeeds(signal: ControlSignal): Seeds {
  return {
    key: hashString(signal.id),
    press: hashString(
      `${signal.id}:${Math.floor(signal.timestamp).toString()}`,
    ),
  };
}

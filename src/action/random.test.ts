import { describe, expect, it } from "vitest";
import { createRandom, hashString } from "./random.ts";

// Cycle 1 (docs/04_plan_action_layer.md): hashString is the base every
// seeded random value in this layer is built from. It has to be pure and
// stable — the same key must hash the same way on every machine, forever,
// for "pressing J always feels like J" to hold.

describe("hashString", () => {
  it("returns the same number for the same string", () => {
    expect(hashString("KeyA")).toBe(hashString("KeyA"));
  });

  it("returns different numbers for different strings", () => {
    expect(hashString("KeyA")).not.toBe(hashString("KeyB"));
  });

  it("returns a non-negative integer below 2^32", () => {
    const result = hashString("KeyA");

    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(2 ** 32);
  });

  it("returns the FNV offset basis for the empty string", () => {
    // 2166136261 is FNV-1a's defined starting value, not a special case in
    // this code — asserting the exact constant proves the real algorithm
    // ran on empty input rather than being short-circuited.
    expect(hashString("")).toBe(2166136261);
  });
});

// Cycle 2 (docs/04_plan_action_layer.md): createRandom is mulberry32 — a
// small, fast generator whose only job is "same seed in, same sequence
// out," which is what makes a firework replayable from its seed alone.

describe("createRandom", () => {
  it("produces the same sequence of values for the same seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produces a different first value for a different seed", () => {
    const a = createRandom(1);
    const b = createRandom(2);

    expect(a()).not.toBe(b());
  });

  it("produces different values on successive calls", () => {
    const random = createRandom(42);

    const first = random();
    const second = random();

    expect(first).not.toBe(second);
  });

  it("always returns a value in [0, 1)", () => {
    const random = createRandom(42);

    for (let i = 0; i < 100; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

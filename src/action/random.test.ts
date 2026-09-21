import { describe, expect, it } from "vitest";
import { hashString } from "./random.ts";

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

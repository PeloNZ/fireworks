import { describe, expect, it } from "vitest";
import { rampLevel } from "./ramp.ts";

// Cycle 2 (docs/09_8bit_renderer.md): rampChar (ASCII) indexes a string and
// rampGlyph (emoji) indexes an array of glyphs -- both dimmest-first
// brightness-to-entry lookups. rampLevel is the same lookup generalised
// over any entry type, shared rather than copied a third time for the
// pixel renderer. Three entries, so brightness 0 returning the *first*
// can't be confused with an off-by-one a two-entry list would hide, and
// numbers rather than strings so a string-indexing implementation fails
// outright.

const levels = [11, 22, 33];

describe("rampLevel", () => {
  it("returns the first entry at brightness 0", () => {
    expect(rampLevel(0, levels)).toBe(11);
  });

  it("returns the last entry at brightness 1", () => {
    expect(rampLevel(1, levels)).toBe(33);
  });

  it("rounds to the nearest entry in between", () => {
    expect(rampLevel(0.4, levels)).toBe(22);
  });

  it("clamps brightness outside 0..1", () => {
    expect(rampLevel(-5, levels)).toBe(11);
    expect(rampLevel(2, levels)).toBe(33);
  });
});

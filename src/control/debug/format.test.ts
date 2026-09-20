import { describe, expect, it } from "vitest";
import { formatControlEvent } from "./format.ts";
import type { ControlEvent } from "../types.ts";

// Cycle 4 (docs/03_plan_control_layer.md): formatControlEvent turns a
// ControlEvent into one line of text. It does not print anything itself —
// see createConsoleSink for that. Testing the string directly, with no
// console spying, is the point of splitting these two apart.

describe("formatControlEvent", () => {
  it("formats a single event as one exact line", () => {
    const event: ControlEvent = {
      kind: "single",
      signal: {
        id: "KeyA",
        shift: true,
        timestamp: 1234,
        intensity: 1,
        source: "keyboard",
      },
    };

    expect(formatControlEvent(event)).toBe(
      "single KeyA shift=true intensity=1 source=keyboard t=1234",
    );
  });

  it("reflects different field values, not a hardcoded line", () => {
    const event: ControlEvent = {
      kind: "single",
      signal: {
        id: "Digit1",
        shift: false,
        timestamp: 9999,
        intensity: 0.5,
        source: "keyboard",
      },
    };

    expect(formatControlEvent(event)).toBe(
      "single Digit1 shift=false intensity=0.5 source=keyboard t=9999",
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { createConsoleSink } from "./consoleSink.ts";
import type { ControlEvent } from "../types.ts";

// createConsoleSink is the one function that actually calls console.debug -
// formatControlEvent (cycle 4) stays pure and does the text; this is the
// one-line function that prints it, kept separate so the text itself is
// tested without spying on console.

const event: ControlEvent = {
  kind: "single",
  signal: {
    id: "KeyA",
    shift: false,
    timestamp: 1000,
    intensity: 1,
    source: "keyboard",
  },
};

describe("createConsoleSink", () => {
  it("logs the formatted event through the given log function", () => {
    const log = vi.fn();
    const sink = createConsoleSink(log);

    sink(event);

    expect(log).toHaveBeenCalledWith(
      "single KeyA shift=false intensity=1 source=keyboard t=1000",
    );
  });

  it("uses console.debug when no log function is given", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const sink = createConsoleSink();

    sink(event);

    expect(spy).toHaveBeenCalledWith(
      "single KeyA shift=false intensity=1 source=keyboard t=1000",
    );
    spy.mockRestore();
  });
});

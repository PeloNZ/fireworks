import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config.ts";
import { createHistory } from "./history.ts";
import type { ControlSignal } from "./types.ts";

// Cycle 3 (docs/03_plan_control_layer.md): createHistory stores signals and
// gives them back bounded two ways — by count and by age. It does not
// interpret them. Time comes from an injected clock, never Date.now() or
// performance.now(), so age-based eviction is testable without waiting.

function signal(id: string, timestamp: number): ControlSignal {
  return { id, shift: false, timestamp, intensity: 1, source: "keyboard" };
}

function fakeClock(start: number) {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

describe("createHistory", () => {
  it("returns a pushed signal from recent()", () => {
    const clock = fakeClock(0);
    const history = createHistory(defaultConfig, clock.now);

    history.push(signal("a", 0));

    expect(history.recent()).toEqual([signal("a", 0)]);
  });

  it("returns signals oldest first", () => {
    const clock = fakeClock(0);
    const history = createHistory(defaultConfig, clock.now);

    history.push(signal("a", 0));
    history.push(signal("b", 10));
    history.push(signal("c", 20));

    expect(history.recent().map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("caps at config.historyMaxEntries, dropping the oldest first", () => {
    const clock = fakeClock(0);
    const config = { ...defaultConfig, historyMaxEntries: 2 };
    const history = createHistory(config, clock.now);

    history.push(signal("a", 0));
    history.push(signal("b", 10));
    history.push(signal("c", 20));

    expect(history.recent().map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("drops entries older than config.historyMaxAgeMs, measured at read time", () => {
    const clock = fakeClock(0);
    const config = { ...defaultConfig, historyMaxAgeMs: 100 };
    const history = createHistory(config, clock.now);

    history.push(signal("a", 0));
    clock.advance(101);

    expect(history.recent()).toEqual([]);
  });

  it("keeps a fresh entry while dropping a stale one pushed earlier", () => {
    const clock = fakeClock(0);
    const config = { ...defaultConfig, historyMaxAgeMs: 100 };
    const history = createHistory(config, clock.now);

    history.push(signal("old", 0));
    clock.advance(101);
    history.push(signal("new", 101));

    expect(history.recent().map((s) => s.id)).toEqual(["new"]);
  });

  it("empties on clear()", () => {
    const clock = fakeClock(0);
    const history = createHistory(defaultConfig, clock.now);

    history.push(signal("a", 0));
    history.clear();

    expect(history.recent()).toEqual([]);
  });

  it("accepts a push after clear() as a fresh start", () => {
    const clock = fakeClock(0);
    const history = createHistory(defaultConfig, clock.now);

    history.push(signal("a", 0));
    history.clear();
    history.push(signal("b", 0));

    expect(history.recent().map((s) => s.id)).toEqual(["b"]);
  });

  it("does not let a caller mutate stored state through the returned array", () => {
    const clock = fakeClock(0);
    const history = createHistory(defaultConfig, clock.now);
    history.push(signal("a", 0));

    const first = history.recent();
    // recent() is typed readonly, so mutating it needs a cast past that.
    // Proves recent() returns a copy, not the internal array with a
    // readonly label a caller could bypass.
    const mutable = first as ControlSignal[];
    mutable.push(signal("intruder", 0));

    expect(history.recent().map((s) => s.id)).toEqual(["a"]);
  });

  it("keeps two instances independent", () => {
    const clock = fakeClock(0);
    const historyA = createHistory(defaultConfig, clock.now);
    const historyB = createHistory(defaultConfig, clock.now);

    historyA.push(signal("a", 0));

    expect(historyB.recent()).toEqual([]);
  });
});

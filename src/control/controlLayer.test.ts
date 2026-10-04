import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../config.ts";
import { createControlLayer } from "./controlLayer.ts";
import type {
  ControllerAdapter,
  ControlEventSink,
  FocusLossSource,
  RawInput,
} from "./types.ts";

// Cycle 6 (docs/03_plan_control_layer.md): createControlLayer is the piece
// that wires an adapter's RawInputs through buildSignal and createHistory
// to a sink. Tests use a fake adapter (a "port", same idea as cycle 5's
// fake target) that captures the emit callback so a test can fire inputs
// directly, and a spy sink to record what was emitted.

function fakeAdapter(): ControllerAdapter & {
  emit: (input: RawInput) => void;
} {
  let emitInput: ((input: RawInput) => void) | null = null;
  return {
    source: "keyboard",
    start(emit) {
      emitInput = emit;
    },
    stop() {
      emitInput = null;
    },
    emit(input) {
      emitInput?.(input);
    },
  };
}

// Cycle 8 (docs/03_plan_control_layer.md): a fake FocusLossSource, same
// shape as fakeAdapter above — a port a test can trigger directly, standing
// in for a real blur/visibilitychange listener.
function fakeFocusLossSource(): FocusLossSource & { trigger: () => void } {
  let onFocusLoss: (() => void) | null = null;
  return {
    start(callback) {
      onFocusLoss = callback;
    },
    stop() {
      onFocusLoss = null;
    },
    trigger() {
      onFocusLoss?.();
    },
  };
}

function fixedClock(value: number): () => number {
  return () => value;
}

describe("createControlLayer", () => {
  it("emits one single event per input, in order", () => {
    const adapter = fakeAdapter();
    const sink: ControlEventSink = vi.fn();
    const layer = createControlLayer({
      adapter,
      config: defaultSettings.control,
      now: fixedClock(0),
      sink,
      focusLoss: fakeFocusLossSource(),
    });
    layer.start();

    adapter.emit({ code: "KeyA", shift: false, timestamp: 0 });
    adapter.emit({ code: "KeyB", shift: true, timestamp: 10 });

    expect(sink).toHaveBeenNthCalledWith(1, {
      kind: "single",
      signal: {
        id: "KeyA",
        shift: false,
        timestamp: 0,
        intensity: 1,
        source: "keyboard",
      },
    });
    expect(sink).toHaveBeenNthCalledWith(2, {
      kind: "single",
      signal: {
        id: "KeyB",
        shift: true,
        timestamp: 10,
        intensity: 1,
        source: "keyboard",
      },
    });
  });

  it("builds signal fields the same way buildSignal itself would", () => {
    const adapter = fakeAdapter();
    const sink = vi.fn();
    const config = { ...defaultSettings.control, defaultIntensity: 0.42 };
    const layer = createControlLayer({
      adapter,
      config,
      now: fixedClock(0),
      sink,
      focusLoss: fakeFocusLossSource(),
    });
    layer.start();

    adapter.emit({ code: "Digit1", shift: false, timestamp: 5 });

    expect(sink).toHaveBeenCalledWith({
      kind: "single",
      signal: {
        id: "Digit1",
        shift: false,
        timestamp: 5,
        intensity: 0.42,
        source: "keyboard",
      },
    });
  });

  it("stop() delegates to the adapter's stop()", () => {
    const adapter = fakeAdapter();
    const stop = vi.spyOn(adapter, "stop");
    const layer = createControlLayer({
      adapter,
      config: defaultSettings.control,
      now: fixedClock(0),
      sink: vi.fn(),
      focusLoss: fakeFocusLossSource(),
    });

    layer.stop();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("stop() also stops the focus-loss source", () => {
    const focusLoss = fakeFocusLossSource();
    const stop = vi.spyOn(focusLoss, "stop");
    const layer = createControlLayer({
      adapter: fakeAdapter(),
      config: defaultSettings.control,
      now: fixedClock(0),
      sink: vi.fn(),
      focusLoss,
    });

    layer.stop();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("clears history when the focus-loss source fires", () => {
    const adapter = fakeAdapter();
    const focusLoss = fakeFocusLossSource();
    const layer = createControlLayer({
      adapter,
      config: defaultSettings.control,
      now: fixedClock(0),
      sink: vi.fn(),
      focusLoss,
    });
    layer.start();
    adapter.emit({ code: "KeyA", shift: false, timestamp: 0 });

    focusLoss.trigger();

    expect(layer.recent()).toEqual([]);
  });

  it("still records signals pushed after a focus loss", () => {
    const adapter = fakeAdapter();
    const focusLoss = fakeFocusLossSource();
    const layer = createControlLayer({
      adapter,
      config: defaultSettings.control,
      now: fixedClock(0),
      sink: vi.fn(),
      focusLoss,
    });
    layer.start();
    adapter.emit({ code: "KeyA", shift: false, timestamp: 0 });
    focusLoss.trigger();

    adapter.emit({ code: "KeyB", shift: false, timestamp: 10 });

    expect(layer.recent()).toEqual([
      {
        id: "KeyB",
        shift: false,
        timestamp: 10,
        intensity: 1,
        source: "keyboard",
      },
    ]);
  });

  it("exposes recent history through recent()", () => {
    const adapter = fakeAdapter();
    const layer = createControlLayer({
      adapter,
      config: defaultSettings.control,
      now: fixedClock(0),
      sink: vi.fn(),
      focusLoss: fakeFocusLossSource(),
    });
    layer.start();

    adapter.emit({ code: "KeyA", shift: false, timestamp: 0 });

    expect(layer.recent()).toEqual([
      {
        id: "KeyA",
        shift: false,
        timestamp: 0,
        intensity: 1,
        source: "keyboard",
      },
    ]);
  });

  it("produces byte-identical sink output and history from two fresh layers given the same inputs", () => {
    const inputs: RawInput[] = [
      { code: "KeyA", shift: false, timestamp: 0 },
      { code: "KeyB", shift: true, timestamp: 10 },
      { code: "KeyA", shift: false, timestamp: 2500 },
    ];

    function run() {
      const adapter = fakeAdapter();
      const sink = vi.fn();
      const layer = createControlLayer({
        adapter,
        config: defaultSettings.control,
        now: fixedClock(0),
        sink,
        focusLoss: fakeFocusLossSource(),
      });
      layer.start();
      for (const input of inputs) {
        adapter.emit(input);
      }
      return { sinkCalls: sink.mock.calls, history: layer.recent() };
    }

    const first = run();
    const second = run();

    expect(second.sinkCalls).toEqual(first.sinkCalls);
    expect(second.history).toEqual(first.history);
  });
});

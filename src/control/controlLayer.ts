import type { ControlConfig } from "./config.ts";
import { createHistory } from "./history.ts";
import { buildSignal } from "./signal.ts";
import type { ControlEventSink, ControllerAdapter } from "./types.ts";

/**
 * Wires an adapter's RawInputs to a sink: each input becomes a
 * ControlSignal (via `buildSignal`), gets pushed to a bounded history (via
 * `createHistory`), and is wrapped as a `{ kind: "single" }` event before
 * reaching `sink`. This is the whole Control layer, assembled — everything
 * upstream of here is pure; this function is the one place that wires
 * them together and calls the adapter and the sink.
 */
export function createControlLayer(options: {
  readonly adapter: ControllerAdapter;
  readonly config: ControlConfig;
  readonly now: () => number;
  readonly sink: ControlEventSink;
}) {
  const { adapter, config, now, sink } = options;
  const history = createHistory(config, now);

  return {
    start(): void {
      adapter.start((input) => {
        const signal = buildSignal(input, adapter.source, config);
        history.push(signal);
        sink({ kind: "single", signal });
      });
    },
    stop(): void {
      adapter.stop();
    },
    /** Recent signal history — see `createHistory`'s `recent()` for the
     * count/age bounds and copy semantics this delegates to. */
    recent() {
      return history.recent();
    },
  };
}

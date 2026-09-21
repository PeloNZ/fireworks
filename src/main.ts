import { defaultConfig } from "./control/config.ts";
import { createKeyboardAdapter } from "./control/adapters/keyboard.ts";
import { createWindowFocusLoss } from "./control/adapters/focusLoss.ts";
import { createConsoleSink } from "./control/debug/consoleSink.ts";
import { createControlLayer } from "./control/controlLayer.ts";

// The dev harness: wires the real keyboard adapter, through the real
// control layer, to the real console sink. This file is the only thing
// in the Control layer that isn't unit tested — it's wiring, not logic,
// proven by pressing keys in a real browser instead of by a test. See
// "Why a fake target beats jsdom" and cycle 7 in
// docs/03_plan_control_layer.md.

const adapter = createKeyboardAdapter({
  target: window,
  config: defaultConfig.keyboard,
});
const sink = createConsoleSink();

// Not `now: performance.now` — that passes the function detached from the
// `performance` object it depends on, and calling it would throw "Illegal
// invocation" in a real browser. Same lesson as cycle 5's `no-unbound-method`
// fix, just not one a linter can catch here since `performance.now` is a
// browser built-in, not a type this codebase declares.
const focusLoss = createWindowFocusLoss({
  windowTarget: window,
  documentTarget: document,
});

const layer = createControlLayer({
  adapter,
  config: defaultConfig,
  now: () => performance.now(),
  sink,
  focusLoss,
});

declare global {
  interface Window {
    /** The running control layer, for poking from devtools:
     * `controlLayer.recent()`, `controlLayer.stop()`, `controlLayer.start()`. */
    controlLayer: typeof layer;
  }
}
window.controlLayer = layer;

layer.start();

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  const heading = document.createElement("p");
  heading.textContent = "Fireworks — Control layer dev harness.";
  const instructions = document.createElement("p");
  instructions.textContent = "Press any key. Open the console to see events.";
  app.append(heading, instructions);
}

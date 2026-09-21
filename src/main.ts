import { defaultConfig } from "./control/config.ts";
import { createKeyboardAdapter } from "./control/adapters/keyboard.ts";
import { createWindowFocusLoss } from "./control/adapters/focusLoss.ts";
import { createControlLayer } from "./control/controlLayer.ts";
import { defaultActionConfig } from "./action/config.ts";
import { defaultWorldConfig } from "./action/worldConfig.ts";
import { createActionLayer } from "./action/actionLayer.ts";
import { createWorld } from "./action/world.ts";
import { createSpecConsoleSink } from "./action/debug/consoleSink.ts";
import type { FireworkPhase } from "./action/types.ts";

// The dev harness: Control -> Action -> a fixed-step firework simulation,
// traced to the console. This file is the only thing in either layer
// that isn't unit tested — it's wiring, not logic, proven by pressing keys
// in a real browser instead of by a test. See "Why a fake target beats
// jsdom" in docs/03_plan_control_layer.md and "File layout" in
// docs/04_plan_action_layer.md.

const adapter = createKeyboardAdapter({
  target: window,
  config: defaultConfig.keyboard,
});

const focusLoss = createWindowFocusLoss({
  windowTarget: window,
  documentTarget: document,
});

const world = createWorld({
  worldConfig: defaultWorldConfig,
  config: defaultActionConfig,
});

// Not `now: performance.now` — that passes the function detached from the
// `performance` object it depends on, and calling it would throw "Illegal
// invocation" in a real browser. Same lesson as cycle 5's `no-unbound-method`
// fix, just not one a linter can catch here since `performance.now` is a
// browser built-in, not a type this codebase declares.
const layer = createControlLayer({
  adapter,
  config: defaultConfig,
  now: () => performance.now(),
  sink: createActionLayer({ world, config: defaultActionConfig }),
  focusLoss,
});

declare global {
  interface Window {
    /** The running control layer, for poking from devtools:
     * `controlLayer.recent()`, `controlLayer.stop()`, `controlLayer.start()`. */
    controlLayer: typeof layer;
    /** The running firework simulation, for poking from devtools:
     * `actionWorld.entities()`, `actionWorld.alpha()`. */
    actionWorld: typeof world;
  }
}
window.controlLayer = layer;
window.actionWorld = world;

layer.start();

// Traces each firework through its phases in the console — one line per
// phase change, not per animation frame, so the log stays readable.
// formatFirework (cycle 16) and createSpecConsoleSink (cycle 17) do the
// actual formatting and printing; this loop only decides when to call it.
const specSink = createSpecConsoleSink();
const lastLoggedPhase = new Map<string, FireworkPhase>();
let lastFrameTime: number | null = null;

function frame(now: number): void {
  const elapsedMs = lastFrameTime === null ? 0 : now - lastFrameTime;
  lastFrameTime = now;
  world.step(elapsedMs);

  const liveIds = new Set<string>();
  for (const firework of world.entities()) {
    liveIds.add(firework.spec.id);
    if (lastLoggedPhase.get(firework.spec.id) !== firework.phase) {
      lastLoggedPhase.set(firework.spec.id, firework.phase);
      specSink(firework);
    }
  }
  // A firework that's left the world (its one "finished" frame already
  // logged above, on some earlier call) has no reason to keep an entry
  // here — dropping it now is what keeps this map bounded over a long
  // session instead of growing by one id per key press forever.
  for (const id of lastLoggedPhase.keys()) {
    if (!liveIds.has(id)) {
      lastLoggedPhase.delete(id);
    }
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  const heading = document.createElement("p");
  heading.textContent = "Fireworks — Action layer dev harness.";
  const instructions = document.createElement("p");
  instructions.textContent = "Press any key. Open the console to see events.";
  app.append(heading, instructions);
}

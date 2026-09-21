import { defaultConfig } from "./control/config.ts";
import { createKeyboardAdapter } from "./control/adapters/keyboard.ts";
import { createWindowFocusLoss } from "./control/adapters/focusLoss.ts";
import { createControlLayer } from "./control/controlLayer.ts";
import { defaultActionConfig } from "./action/config.ts";
import { defaultWorldConfig } from "./action/worldConfig.ts";
import { createActionLayer } from "./action/actionLayer.ts";
import { createWorld } from "./action/world.ts";
import { createSpecConsoleSink } from "./action/debug/consoleSink.ts";
import { hashString } from "./action/random.ts";
import { defaultAudioVisualConfig } from "./audiovisual/config.ts";
import { createAudioVisualLayer } from "./audiovisual/audioVisualLayer.ts";
import { buildBackdrop } from "./audiovisual/backdrop.ts";
import { createAsciiRenderer } from "./audiovisual/adapters/ascii.ts";
import { createEmojiRenderer } from "./audiovisual/adapters/emoji.ts";
import { createWebAudioSink } from "./audiovisual/adapters/webAudio.ts";
import { selectRenderer } from "./audiovisual/selectRenderer.ts";
import { planToneVoices } from "./audiovisual/voices/tones.ts";
import type { TextTarget } from "./audiovisual/adapters/ascii.ts";
import type { FireworkPhase } from "./action/types.ts";
import type { Renderer } from "./audiovisual/types.ts";

// The dev harness: Control -> Action -> AudioVisual, an ASCII grid drawn
// on a fixed-step render loop. This file is the only thing in any layer
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

const app = document.querySelector<HTMLDivElement>("#app");
const heading = document.createElement("p");
heading.textContent = "Fireworks — AudioVisual layer dev harness.";
const instructions = document.createElement("p");
instructions.textContent = "Press any key. Open the console to see events.";
const grid = document.createElement("pre");
if (app) {
  app.append(heading, instructions, grid);
}

// Browsers refuse to make sound before the user has interacted with the
// page — create the context any time, but only resume it once a keydown
// has actually happened. `{ once: true }` removes this listener after it
// fires, so it never runs again for the rest of the session.
const audioContext = new AudioContext();
window.addEventListener(
  "keydown",
  () => {
    void audioContext.resume();
  },
  { once: true },
);

// A fresh sky on every page load, by explicit choice: nothing in the URL,
// nothing stored, nothing surfaced. Refreshing until you get one you like
// is the whole interaction. This file is the only place in any layer
// allowed to read real nondeterminism — the same licence the
// `now: () => performance.now()` above takes, and the reason
// `grep -rE "Math.random|Date.now" src/audiovisual/` stays empty.
// `Date.now()` alone would be nearly identical between two quick reloads,
// so `Math.random()` supplies the entropy and `hashString` folds the pair
// into the uint32 `createRandom` expects. See docs/06_world_backdrop.md.
const backdropSeed = hashString(
  `${Date.now().toString()}:${Math.random().toString()}`,
);
const backdrop = buildBackdrop(backdropSeed, defaultAudioVisualConfig.backdrop);

// Which renderer runs is a lookup in this table, not a two-way branch —
// the point of building a second renderer is that this project now has
// more than one, and a third means one more entry here and nothing else.
// Each entry is a closure over the config and backdrop above it, taking
// only the target it will draw into. See "Selecting a renderer" in
// docs/07_emoji_renderer.md.
const renderers: Record<string, (target: TextTarget) => Renderer> = {
  ascii: (target) =>
    createAsciiRenderer({ target, config: defaultAudioVisualConfig, backdrop }),
  emoji: (target) =>
    createEmojiRenderer({ target, config: defaultAudioVisualConfig, backdrop }),
};
const { name: rendererName, create: createRenderer } = selectRenderer(
  new URLSearchParams(location.search).get("renderer"),
  renderers,
  "ascii",
);
grid.className = rendererName;

const audioVisual = createAudioVisualLayer({
  renderer: createRenderer(grid),
  audio: createWebAudioSink({
    context: audioContext,
    config: defaultAudioVisualConfig,
  }),
  voicePlanner: planToneVoices,
  config: defaultAudioVisualConfig,
  worldConfig: defaultWorldConfig,
});

// Traces each firework through its phases in the console — one line per
// phase change, not per animation frame, so the log stays readable.
// formatFirework and createSpecConsoleSink do the actual formatting and
// printing; this loop only decides when to call it.
const specSink = createSpecConsoleSink();
const lastLoggedPhase = new Map<string, FireworkPhase>();
let lastFrameTime: number | null = null;

function frame(now: number): void {
  const rawElapsedMs = lastFrameTime === null ? 0 : now - lastFrameTime;
  lastFrameTime = now;
  // Clamped below the shortest phase Action can produce (100ms at default
  // config), so a backgrounded tab's return never runs an unbounded burst
  // of physics steps in one turn, and the AudioVisual layer's phase
  // watcher (cycle 16) never misses a transition. See "Why the elapsed
  // time is clamped" in docs/05_audio_visual_layer.md.
  const elapsedMs = Math.min(rawElapsedMs, defaultAudioVisualConfig.maxFrameMs);
  world.step(elapsedMs);

  const entities = world.entities();
  const liveIds = new Set<string>();
  for (const firework of entities) {
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

  audioVisual.present({ entities, alpha: world.alpha(), elapsedMs });

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

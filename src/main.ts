import { defaultSettings } from "./config.ts";
import { createKeyboardAdapter } from "./control/adapters/keyboard.ts";
import { createWindowFocusLoss } from "./control/adapters/focusLoss.ts";
import { createControlLayer } from "./control/controlLayer.ts";
import { createActionLayer } from "./action/actionLayer.ts";
import { createWorld } from "./action/world.ts";
import { createSpecConsoleSink } from "./action/debug/consoleSink.ts";
import { createRandom, hashString } from "./action/random.ts";
import { ambientForWidth } from "./audiovisual/ambient.ts";
import { createAudioVisualLayer } from "./audiovisual/audioVisualLayer.ts";
import { buildBackdrop } from "./audiovisual/backdrop.ts";
import { createAsciiRenderer } from "./audiovisual/adapters/ascii.ts";
import { createEmojiRenderer } from "./audiovisual/adapters/emoji.ts";
import { createNeonRenderer } from "./audiovisual/adapters/neon.ts";
import { createPixelRenderer } from "./audiovisual/adapters/pixel.ts";
import { worldHalfWidth } from "./audiovisual/adapters/pixelGrid.ts";
import { createWebAudioSink } from "./audiovisual/adapters/webAudio.ts";
import { selectRenderer } from "./audiovisual/selectRenderer.ts";
import { applySettingsForm, loadSettings } from "./settings/overrides.ts";
import { attachSettingsMenu, choicesFor } from "./settings/settingsMenu.ts";
import { soundSets } from "./audiovisual/voices/sets.ts";
import type { FireworkPhase } from "./action/types.ts";
import type { Renderer } from "./audiovisual/types.ts";

// The dev harness: Control -> Action -> AudioVisual, an ASCII grid drawn
// on a fixed-step render loop. This file is the only thing in any layer
// that isn't unit tested — it's wiring, not logic, proven by pressing keys
// in a real browser instead of by a test. See "Why a fake target beats
// jsdom" in docs/03_plan_control_layer.md and "File layout" in
// docs/04_plan_action_layer.md.

// The defaults with any settings saved in localStorage laid over them. Each
// store method reads `localStorage` inside itself, so a browser that throws
// on access (a private window, blocked site data) gives the defaults. The
// settings form writes through the same store. See
// docs/13_settings_overrides.md.
const store = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
  },
};
const settings = loadSettings(store, defaultSettings);

const adapter = createKeyboardAdapter({
  target: window,
  config: settings.control.keyboard,
});

const focusLoss = createWindowFocusLoss({
  windowTarget: window,
  documentTarget: document,
});

const world = createWorld({
  worldConfig: settings.world,
  config: settings.action,
});

// Not `now: performance.now` — that passes the function detached from the
// `performance` object it depends on, and calling it would throw "Illegal
// invocation" in a real browser. Same lesson as cycle 5's `no-unbound-method`
// fix, just not one a linter can catch here since `performance.now` is a
// browser built-in, not a type this codebase declares.
const layer = createControlLayer({
  adapter,
  config: settings.control,
  now: () => performance.now(),
  sink: createActionLayer({ world, config: settings.action }),
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
if (app === null) {
  // Every renderer below appends its own node straight into #app rather
  // than into a fallback element, so a missing host means there is
  // nowhere to render at all — worth an early, specific failure rather
  // than a silently blank page.
  throw new Error("main.ts: #app element not found");
}
const heading = document.createElement("p");
heading.textContent = "Fireworks — AudioVisual layer dev harness.";
const instructions = document.createElement("p");
instructions.textContent =
  "Press any key. Press Esc for settings. Open the console to see events.";
// app.append(heading, instructions);

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
const backdrop = buildBackdrop(backdropSeed, settings.audiovisual.backdrop);
// The ambient movers (shooting stars, satellites) roll their dice from a
// stream of their own, seeded off the same page-load seed, the way
// `buildBackdrop` splits its sky, bodies and ground. See
// docs/11_ambient_movers.md.
const ambientRandom = createRandom(
  hashString(`${backdropSeed.toString()}:ambient`),
);

// Which renderer runs is a lookup in this table, not a two-way branch —
// the point of building a second renderer is that this project now has
// more than one, and each further renderer is one more entry here and
// nothing else. Each entry is a closure over the config and backdrop above
// it, taking the element it will render into and appending whatever nodes
// it needs — one `<pre>` for ascii/emoji, two stacked `<canvas>`es for
// pixel and for neon. See "Selecting a renderer" in
// docs/07_emoji_renderer.md and "main.ts registry" in
// docs/09_8bit_renderer.md.
//
// Each entry also says how much of the world it shows, as a half-width in
// world x: the ambient movers spawn across all of it. Ascii and emoji show
// the whole square world, x from -50 to 50. The pixel and neon grids
// follow the window. See docs/11_ambient_movers.md.
const squareWorldHalfWidth = 50;
const renderers: Record<
  string,
  (host: HTMLElement) => { renderer: Renderer; halfWidth: number }
> = {
  ascii: (host) => {
    const target = document.createElement("pre");
    target.className = "ascii";
    host.append(target);
    return {
      renderer: createAsciiRenderer({
        target,
        config: settings.audiovisual,
        backdrop,
      }),
      halfWidth: squareWorldHalfWidth,
    };
  },
  emoji: (host) => {
    const target = document.createElement("pre");
    target.className = "emoji";
    host.append(target);
    return {
      renderer: createEmojiRenderer({
        target,
        config: settings.audiovisual,
        backdrop,
      }),
      halfWidth: squareWorldHalfWidth,
    };
  },
  // Fills the viewport with square pixels: rows is fixed (the
  // chunkiness dial), columns is derived from the real window so the
  // world's full height always fits and a ring burst stays round
  // whatever shape the window is. See "The geometry" in
  // docs/09_8bit_renderer.md.
  pixel: (host) => {
    const { rows } = settings.audiovisual.pixel;
    const columns = Math.round((rows * window.innerWidth) / window.innerHeight);
    const config = {
      ...settings.audiovisual,
      pixel: { ...settings.audiovisual.pixel, columns },
    };

    const background = document.createElement("canvas");
    background.className = "pixel pixel-background";
    background.width = columns;
    background.height = rows;
    const sprites = document.createElement("canvas");
    sprites.className = "pixel pixel-sprites";
    sprites.width = columns;
    sprites.height = rows;
    host.append(background, sprites);

    const backgroundContext = background.getContext("2d");
    const spritesContext = sprites.getContext("2d");
    if (backgroundContext === null || spritesContext === null) {
      throw new Error("pixel renderer: 2d canvas context unavailable");
    }
    // Without this, the browser bilinearly smooths the upscale from a
    // few hundred pixels to the full viewport, and the whole 8-bit look
    // dies. See docs/09_8bit_renderer.md.
    backgroundContext.imageSmoothingEnabled = false;
    spritesContext.imageSmoothingEnabled = false;

    const renderer = createPixelRenderer({
      background: {
        paint: (pixels, width, height) => {
          backgroundContext.putImageData(
            new ImageData(pixels, width, height),
            0,
            0,
          );
        },
      },
      sprites: {
        paint: (pixels, width, height) => {
          spritesContext.putImageData(
            new ImageData(pixels, width, height),
            0,
            0,
          );
        },
      },
      config,
      backdrop,
    });
    return { renderer, halfWidth: worldHalfWidth({ columns, rows }) };
  },
  // Smooth lines in Display P3, on canvases as big as the screen's real
  // pixels: `devicePixelRatio` is read once here, like the window size for
  // pixel, so the renderer in src/audiovisual/ never reads either. Two
  // stacked canvases: the backdrop is painted once and the light is redrawn
  // each frame. The two bloom canvases are never in the page: they hold
  // shrunk copies of the light canvas. See docs/12_neon_renderer.md.
  neon: (host) => {
    const pixelRatio = window.devicePixelRatio;
    const width = Math.round(window.innerWidth * pixelRatio);
    const height = Math.round(window.innerHeight * pixelRatio);

    const canvasOf = (canvasWidth: number, canvasHeight: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      return canvas;
    };
    // `colorSpace` makes the canvas Display P3 on a browser that supports it.
    // Firefox ignores it and gives an sRGB canvas, which maps the same
    // colours into sRGB.
    const surfaceOf = (canvas: HTMLCanvasElement) => {
      const context = canvas.getContext("2d", { colorSpace: "display-p3" });
      if (context === null) {
        throw new Error("neon renderer: 2d canvas context unavailable");
      }
      return {
        context,
        source: canvas,
        width: canvas.width,
        height: canvas.height,
      };
    };

    const backdropCanvas = canvasOf(width, height);
    backdropCanvas.className = "neon neon-backdrop";
    const lightCanvas = canvasOf(width, height);
    lightCanvas.className = "neon neon-light";
    host.append(backdropCanvas, lightCanvas);

    const renderer = createNeonRenderer({
      background: surfaceOf(backdropCanvas),
      light: surfaceOf(lightCanvas),
      quarter: surfaceOf(canvasOf(Math.ceil(width / 4), Math.ceil(height / 4))),
      eighth: surfaceOf(canvasOf(Math.ceil(width / 8), Math.ceil(height / 8))),
      backdrop,
      config: settings.audiovisual.neon,
    });
    return {
      renderer,
      halfWidth: worldHalfWidth({ columns: width, rows: height }),
    };
  },
};
// A saved name that is not in the table falls back to the default.
const { name: rendererName, create: createRenderer } = selectRenderer(
  settings.renderer,
  renderers,
  defaultSettings.renderer,
);
const { renderer, halfWidth } = createRenderer(app);

// Which sound set plays is the same kind of lookup, against its own
// table. See docs/08_sound_effects.md.
const { name: soundName, create: voicePlanner } = selectRenderer(
  settings.sound,
  soundSets,
  defaultSettings.sound,
);

// The settings menu: Escape opens a native <dialog> holding a POST form. A
// page script cannot read the body of a POST page load, and neither Vite nor a
// static host sends one to the page, so the `submit` listener below reads the
// fields, saves them through `applySettingsForm` and reloads. No setting goes
// in the URL. The fields start on the values that run now (`rendererName`,
// `soundName`, `settings.world`) and set them as default values, so Reset
// puts them back. See docs/13_settings_overrides.md.
function radioGroup(
  legendText: string,
  field: string,
  names: readonly string[],
  selected: string,
): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = legendText;
  fieldset.append(legend);
  for (const choice of choicesFor(names, selected)) {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = field;
    input.value = choice.value;
    input.defaultChecked = choice.checked;
    const label = document.createElement("label");
    label.append(input, ` ${choice.value}`);
    const row = document.createElement("div");
    row.append(label);
    fieldset.append(row);
  }
  return fieldset;
}

interface RangeSpec {
  readonly label: string;
  readonly name: string; // a dotted path into Settings
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly tickEvery: number;
  readonly value: number;
  readonly vertical?: boolean;
}

// A label, a range with tick marks (a <datalist>) and an <output> that shows
// its number. Whatever the saved value is, the browser clamps it to `min` and
// `max` and snaps it to `step`.
function rangeField(spec: RangeSpec): HTMLDivElement {
  const id = `setting-${spec.name}`;
  const input = document.createElement("input");
  input.type = "range";
  input.id = id;
  input.name = spec.name;
  // `min` and `max` go first, so the browser does not clamp the value to 0..100.
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step);
  input.defaultValue = String(spec.value);
  input.setAttribute("list", `${id}-ticks`);
  if (spec.vertical) {
    input.classList.add("vertical");
  }
  const ticks = document.createElement("datalist");
  ticks.id = `${id}-ticks`;
  const tickCount = Math.round((spec.max - spec.min) / spec.tickEvery);
  for (let index = 0; index <= tickCount; index += 1) {
    const option = document.createElement("option");
    option.value = String(spec.min + index * spec.tickEvery);
    option.label = option.value;
    ticks.append(option);
  }
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = spec.label;
  const output = document.createElement("output");
  output.htmlFor.add(id);
  output.textContent = input.value;
  input.addEventListener("input", () => {
    output.value = input.value;
  });
  const row = document.createElement("div");
  row.append(label, " ", input, ticks, " ", output);
  return row;
}

function worldGroup(): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "World";
  fieldset.append(
    legend,
    rangeField({
      label: "Gravity (down is negative)",
      name: "world.gravity.y",
      min: -60,
      max: 60,
      step: 1,
      tickEvery: 10,
      value: settings.world.gravity.y,
      vertical: true,
    }),
    rangeField({
      label: "Wind (right is positive)",
      name: "world.wind.x",
      min: -20,
      max: 20,
      step: 0.5,
      tickEvery: 5,
      value: settings.world.wind.x,
    }),
    rangeField({
      label: "Drag",
      name: "world.drag",
      min: 0,
      max: 3,
      step: 0.05,
      tickEvery: 0.5,
      value: settings.world.drag,
    }),
  );
  return fieldset;
}

function commandButton(text: string, command: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "submit";
  button.name = "command";
  button.value = command;
  button.textContent = text;
  return button;
}

const settingsForm = document.createElement("form");
settingsForm.method = "post";
// Apply comes first, because Enter submits with the first submit button.
const apply = commandButton("Apply", "apply");
const defaults = commandButton("Defaults", "defaults");
const reset = document.createElement("button");
reset.type = "reset";
reset.textContent = "Reset";
// No name, so `applySettingsForm` gives "none". `formMethod = "dialog"` closes
// the dialog and skips the POST.
const cancel = document.createElement("button");
cancel.type = "submit";
cancel.formMethod = "dialog";
cancel.textContent = "Cancel";
settingsForm.append(
  radioGroup("Renderer", "renderer", Object.keys(renderers), rendererName),
  radioGroup("Sound", "sound", Object.keys(soundSets), soundName),
  worldGroup(),
  apply,
  defaults,
  reset,
  cancel,
);
settingsForm.addEventListener("submit", (event) => {
  const outcome = applySettingsForm(
    new FormData(settingsForm, event.submitter),
    store,
    defaultSettings,
  );
  if (outcome !== "none") {
    event.preventDefault();
    location.reload();
  }
});
const settingsDialog = document.createElement("dialog");
settingsDialog.append(settingsForm);
app.append(settingsDialog);
attachSettingsMenu({
  dialog: settingsDialog,
  keyTarget: window,
  control: layer,
});

const audioVisual = createAudioVisualLayer({
  renderer,
  audio: createWebAudioSink({
    context: audioContext,
    config: settings.audiovisual,
  }),
  voicePlanner,
  ambientRandom,
  config: {
    ...settings.audiovisual,
    ambient: ambientForWidth(settings.audiovisual.ambient, halfWidth),
  },
  worldConfig: settings.world,
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
  const elapsedMs = Math.min(rawElapsedMs, settings.audiovisual.maxFrameMs);
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

import { defaultConfig } from "./control/config.ts";
import { createKeyboardAdapter } from "./control/adapters/keyboard.ts";
import { createWindowFocusLoss } from "./control/adapters/focusLoss.ts";
import { createControlLayer } from "./control/controlLayer.ts";
import { defaultActionConfig } from "./action/config.ts";
import { defaultWorldConfig } from "./action/worldConfig.ts";
import { createActionLayer } from "./action/actionLayer.ts";
import { createWorld } from "./action/world.ts";
import { createSpecConsoleSink } from "./action/debug/consoleSink.ts";
import { createRandom, hashString } from "./action/random.ts";
import { defaultAudioVisualConfig } from "./audiovisual/config.ts";
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
const backdrop = buildBackdrop(backdropSeed, defaultAudioVisualConfig.backdrop);
// The ambient movers (shooting stars, satellites) roll their dice from a
// stream of their own, seeded off the same page-load seed, the way
// `buildBackdrop` splits its sky, bodies and ground. See
// docs/11_ambient_movers.md.
const ambientRandom = createRandom(
  hashString(`${backdropSeed.toString()}:ambient`),
);

// Which renderer runs is a lookup in this table, not a two-way branch —
// the point of building a second renderer is that this project now has
// more than one, and a third means one more entry here and nothing else.
// Each entry is a closure over the config and backdrop above it, taking
// the element it will render into and appending whatever nodes it needs
// — one `<pre>` for ascii/emoji, two stacked `<canvas>`es for pixel. See
// "Selecting a renderer" in docs/07_emoji_renderer.md and "main.ts
// registry" in docs/09_8bit_renderer.md.
//
// Each entry also says how much of the world it shows, as a half-width in
// world x: the ambient movers spawn across all of it. Ascii and emoji show
// the whole square world, x from -50 to 50. The pixel grid follows the
// window. See docs/11_ambient_movers.md.
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
        config: defaultAudioVisualConfig,
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
        config: defaultAudioVisualConfig,
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
    const { rows } = defaultAudioVisualConfig.pixel;
    const columns = Math.round((rows * window.innerWidth) / window.innerHeight);
    const config = {
      ...defaultAudioVisualConfig,
      pixel: { ...defaultAudioVisualConfig.pixel, columns },
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
      config: defaultAudioVisualConfig.neon,
    });
    return {
      renderer,
      halfWidth: worldHalfWidth({ columns: width, rows: height }),
    };
  },
};
const { name: rendererName, create: createRenderer } = selectRenderer(
  new URLSearchParams(location.search).get("renderer"),
  renderers,
  "ascii",
);
const { renderer, halfWidth } = createRenderer(app);

// Which sound set plays is the same kind of lookup, against its own
// table — a `?sound=` this project now has more than one entry for. See
// docs/08_sound_effects.md.
const { name: soundName, create: voicePlanner } = selectRenderer(
  new URLSearchParams(location.search).get("sound"),
  soundSets,
  "tones",
);

// The settings menu: Escape opens a native <dialog> with one radio group per
// lookup table above. Apply submits a GET form, so the browser itself writes
// `?renderer=…&sound=…` and reloads — no code here builds a query string.
// The radios start on the names that actually run (`rendererName`,
// `soundName`), not the raw URL values, so `?renderer=foo` shows `ascii`
// checked. See docs/10_settings_ui.md.
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
    input.checked = choice.checked;
    const label = document.createElement("label");
    label.append(input, ` ${choice.value}`);
    const row = document.createElement("div");
    row.append(label);
    fieldset.append(row);
  }
  return fieldset;
}

const settingsForm = document.createElement("form");
settingsForm.method = "get";
const apply = document.createElement("button");
apply.type = "submit";
apply.textContent = "Apply";
// `formMethod = "dialog"` closes the dialog and skips the GET navigation.
const cancel = document.createElement("button");
cancel.type = "submit";
cancel.formMethod = "dialog";
cancel.textContent = "Cancel";
settingsForm.append(
  radioGroup("Renderer", "renderer", Object.keys(renderers), rendererName),
  radioGroup("Sound", "sound", Object.keys(soundSets), soundName),
  apply,
  cancel,
);
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
    config: defaultAudioVisualConfig,
  }),
  voicePlanner,
  ambientRandom,
  config: {
    ...defaultAudioVisualConfig,
    ambient: ambientForWidth(defaultAudioVisualConfig.ambient, halfWidth),
  },
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

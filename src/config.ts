// Every default setting, in one tree. Each layer keeps the type of its own
// part (`ControlConfig`, `WorldConfig`, `ActionConfig`, `AudioVisualConfig`)
// and takes its values from here through `main.ts`, so a value has one home.

import type { ActionConfig } from "./action/config.ts";
import type { FireworkPattern, FireworkTimbre } from "./action/types.ts";
import type { WorldConfig } from "./action/worldConfig.ts";
import type { AudioVisualConfig } from "./audiovisual/config.ts";
import type { ControlConfig } from "./control/config.ts";

interface Settings {
  // Which renderer and sound set run when none is chosen. They are keys of
  // the `renderers` and `soundSets` tables.
  readonly renderer: string;
  readonly sound: string;
  readonly control: ControlConfig;
  readonly world: WorldConfig;
  readonly action: ActionConfig;
  readonly audiovisual: AudioVisualConfig;
}

export const defaultSettings: Settings = Object.freeze({
  renderer: "ascii",
  sound: "tones",
  control: Object.freeze({
    defaultIntensity: 1.0,
    historyMaxEntries: 16,
    historyMaxAgeMs: 2000,
    keyboard: Object.freeze({
      deniedCodes: Object.freeze([
        "ShiftLeft",
        "ShiftRight",
        "ControlLeft",
        "ControlRight",
        "AltLeft",
        "AltRight",
        "MetaLeft",
        "MetaRight",
        "CapsLock",
        // Opens the settings menu, so it must not also launch a firework.
        "Escape",
      ]),
    }),
  }),
  world: Object.freeze({
    gravity: Object.freeze({ x: 0, y: -18, z: 0 }),
    wind: Object.freeze({ x: 1.5, y: 0, z: 0 }),
    drag: 0.3,
    stepMs: 1000 / 120,
  }),
  action: Object.freeze({
    launchOrigin: Object.freeze({ x: 0, y: 0, z: 0 }),
    launchSpeed: Object.freeze({ min: 35, max: 65 }),
    launchAngle: Object.freeze({ min: -25, max: 25 }),
    thrust: Object.freeze({ min: 25, max: 50 }),
    fuelMs: Object.freeze({ min: 300, max: 800 }),
    fuseMs: Object.freeze({ min: 800, max: 2400 }),
    patterns: Object.freeze<readonly FireworkPattern[]>([
      "peony",
      "willow",
      "ring",
      "chrysanthemum",
    ]),
    palettes: Object.freeze([
      Object.freeze([
        "#ff3b30",
        "#ff9500",
        "#ffcc00",
        "#ffe066",
        "#ff6b6b",
        "#ffb4a2",
        "#ff8552",
        "#ffd23f",
      ]),
      Object.freeze([
        "#34c759",
        "#30d5c8",
        "#00c2ff",
        "#5ac8fa",
        "#a1f2e0",
        "#7fffd4",
        "#48cae4",
        "#90e0ef",
      ]),
      Object.freeze([
        "#af52de",
        "#ff2d95",
        "#c77dff",
        "#e0aaff",
        "#ff8fe3",
        "#d291ff",
        "#f72585",
        "#b5179e",
      ]),
    ]),
    paletteSize: 3,
    particleCount: Object.freeze({ min: 40, max: 220 }),
    burstDurationMs: Object.freeze({ min: 800, max: 2800 }),
    launchDurationMs: 200,
    sound: Object.freeze({
      pitch: Object.freeze({ min: 220, max: 880 }),
      timbres: Object.freeze<readonly FireworkTimbre[]>([
        "soft",
        "sharp",
        "crackle",
      ]),
    }),
  }),
  audiovisual: Object.freeze({
    maxFrameMs: 50,
    shellSize: 1.5,
    sparkSize: 0.6,
    sparkSpeed: Object.freeze({ min: 15, max: 40 }),
    trailMaxPoints: 4,
    trailSpacingMs: 40,
    trailMaxAgeMs: 300,
    backdrop: Object.freeze({
      skyMaxBrightness: 0.25,
      starCount: Object.freeze({ min: 18, max: 40 }),
      celestialMinHeight: 35,
      groundPoints: 9,
      groundHeight: Object.freeze({ min: 5, max: 14 }),
      groundFillBrightness: 0.4,
    }),
    ambient: Object.freeze({
      ratePerSecond: 0.05,
      cooldownMs: 8000,
      maxLive: 2,
      shootingStar: Object.freeze({
        x: Object.freeze({ min: -50, max: 50 }),
        y: Object.freeze({ min: 65, max: 95 }),
        speed: Object.freeze({ min: 40, max: 70 }),
        descent: 0.5,
        ttlMs: Object.freeze({ min: 400, max: 800 }),
        brightness: 1,
      }),
      satellite: Object.freeze({
        x: Object.freeze({ min: -50, max: 50 }),
        y: Object.freeze({ min: 80, max: 95 }),
        speed: Object.freeze({ min: 5, max: 9 }),
        brightness: 0.6,
      }),
    }),
    ascii: Object.freeze({
      columns: 80,
      rows: 40,
      ramp: " .:-=+*#%@",
      backdropGlyphs: Object.freeze({
        star: "*",
        moon: "O",
        planet: "o",
        ridge: "^",
      }),
    }),
    emoji: Object.freeze({
      columns: 40,
      rows: 40,
      blank: "⬛",
      shell: "🚀",
      trail: Object.freeze(["⬛", "💫", "✨"]),
      sparkHues: Object.freeze(
        [
          { hue: 0, glyph: "🔴" },
          { hue: 30, glyph: "🟠" },
          { hue: 55, glyph: "🟡" },
          { hue: 130, glyph: "🟢" },
          { hue: 200, glyph: "🔵" },
          { hue: 280, glyph: "🟣" },
          { hue: 330, glyph: "🌸" },
        ].map((entry) => Object.freeze(entry)),
      ),
      desaturated: "⚪",
      saturationFloor: 0.15,
      sky: Object.freeze(["⬛", "🌌", "🟦", "🟪", "🟧"]),
      backdropGlyphs: Object.freeze({
        star: "⭐",
        moon: "🌙",
        planet: "🪐",
        ridge: "🌲",
        ground: "🟫",
      }),
      movers: Object.freeze({ shootingStar: "🌠", satellite: "🛸" }),
    }),
    pixel: Object.freeze({
      // The same hues as emoji.sparkHues, indexing PICO-8's 16-colour
      // palette (cycle 16) instead of a glyph — 8..14 are its bright,
      // saturated colours, one per hue band.
      sparkHues: Object.freeze(
        [
          { hue: 0, index: 8 },
          { hue: 30, index: 9 },
          { hue: 55, index: 10 },
          { hue: 130, index: 11 },
          { hue: 200, index: 12 },
          { hue: 280, index: 13 },
          { hue: 330, index: 14 },
        ].map((entry) => Object.freeze(entry)),
      ),
      desaturated: 7, // #FFF1E8, PICO-8's off-white
      saturationFloor: 0.15,
      shell: 7,
      trail: Object.freeze([0, 5, 6]),
      // 160 rows fixed, so the world's full height always fits and one
      // pixel is 100/160 = 0.625 world units on both axes. 284 columns is
      // that same pixel size across a 16:9 viewport -- main.ts recomputes
      // this from the real window at load.
      columns: 284,
      rows: 160,
      blank: 0,
      // The same progression as emoji.sky, indexing PICO-8's darks and its
      // one warm colour: black, night blue, sky blue, lavender, sunset
      // orange.
      sky: Object.freeze([0, 1, 13, 12, 9]),
      bodies: Object.freeze({
        star: Object.freeze({ index: 7, radius: 0.8 }),
        moon: Object.freeze({ index: 15, radius: 6 }),
        planet: Object.freeze({ index: 9, radius: 2.5 }),
      }),
      // One index, a silhouette -- the medium this renderer draws in can
      // show the real thing, unlike asciiBackdrop's lit shape (see
      // "Why the emoji renderer is not just the ASCII renderer with
      // different characters" for the precedent this follows). Black,
      // darker than every reachable sky index, so the ground reads as
      // solid ground rather than blending into the horizon it meets.
      ground: 0,
      // PICO-8's 16-colour palette. Every index above is a position in
      // this array: 0 black, 1 dark blue, 7 off-white, 8..14 the bright,
      // saturated colours sparkHues indexes, 15 the palest colour (the
      // moon's own). See docs/09_8bit_renderer.md.
      palette: Object.freeze([
        "#000000",
        "#1D2B53",
        "#7E2553",
        "#008751",
        "#AB5236",
        "#5F574F",
        "#C2C3C7",
        "#FFF1E8",
        "#FF004D",
        "#FFA300",
        "#FFEC27",
        "#00E436",
        "#29ADFF",
        "#83769C",
        "#FF77A8",
        "#FFCCAA",
      ]),
      // Black, dark grey, light grey, off-white: a mover fades through greys.
      moverRamp: Object.freeze([0, 5, 6, 7]),
      // A shooting star at speed 40..70 moves 45..78 world units per second
      // (its vertical part adds to the speed), so it trails 5.4..9.4 world units,
      // which is 8 to 15 pixels. A satellite is a single pixel.
      moverTailMs: Object.freeze({ shootingStar: 120, satellite: 0 }),
    }),
    neon: Object.freeze({
      // A spark moves 15..40 world units per second, so a streak is 0.7..1.8
      // world units long: a short bright dash, not a line.
      streakMs: 45,
      shellCore: Object.freeze({
        scale: 1.8,
        color: Object.freeze({ r: 1, g: 0.95, b: 0.85 }),
      }),
      moverColor: Object.freeze({ r: 0.8, g: 0.95, b: 1 }),
      moverSize: 0.4,
      // The same tails as the pixel renderer: a shooting star at 45..78 world
      // units per second streaks 5.4..9.4 world units. A satellite is a dot.
      moverTailMs: Object.freeze({ shootingStar: 120, satellite: 0 }),
      starArm: 0.7,
      // The same radii as the pixel renderer's discs.
      bodies: Object.freeze({ moon: 6, planet: 2.5 }),
      // Cyan, like the ridge. The stars are pale, the rings more saturated.
      starColor: Object.freeze({ r: 0.51, g: 1, b: 1 }),
      starWidth: 0.17,
      ringColor: Object.freeze({ r: 0.24, g: 0.96, b: 1 }),
      ringWidth: 0.25,
      groundFill: Object.freeze({ r: 0.039, g: 0.039, b: 0.063 }),
      ridgeColor: Object.freeze({ r: 0.2, g: 0.95, b: 1 }),
      ridgeWidth: 0.33,
      bloom: Object.freeze({ quarterAlpha: 0.85, eighthAlpha: 1 }),
    }),
    audio: Object.freeze({
      lookaheadMs: 30,
      masterGain: 0.8,
      // Raised from 16 for the silly set (docs/08_sound_effects.md):
      // it plans more voices per cue than tones does — two for flight,
      // up to three bounces for a boing, a flanged body plus several
      // micro-tones for a fizz — and a few fireworks in the air at once
      // would otherwise hit the old cap and drop voices silently.
      maxVoices: 32,
      crackleCount: 5,
      burst: Object.freeze({
        envelope: Object.freeze({
          attackMs: 5,
          decayMs: 50,
          sustainLevel: 0.3,
          releaseMs: 200,
        }),
      }),
      launch: Object.freeze({
        durationMs: 200,
        envelope: Object.freeze({
          attackMs: 10,
          decayMs: 0,
          sustainLevel: 1,
          releaseMs: 60,
        }),
      }),
      flight: Object.freeze({
        envelope: Object.freeze({
          attackMs: 100,
          decayMs: 100,
          sustainLevel: 1,
          releaseMs: 150,
        }),
        gain: 0.18,
      }),
      sets: Object.freeze({
        silly: Object.freeze({
          flightVoiceGain: 0.09,
          bounceCount: 2,
          bounceDecay: 0.6,
          gremlinChance: 0.25,
        }),
      }),
    }),
  }),
});

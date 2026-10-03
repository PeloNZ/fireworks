// Rendering and audio tunables for the AudioVisual layer, grown one cycle
// at a time as buildFrame and its neighbours need each field — the same
// discipline src/action/config.ts follows for ActionConfig.

import type { NumberRange } from "../action/config.ts";
import type { Envelope } from "./types.ts";

/** A body's fixed look — no brightness field, the same reason
 * `CelestialBody` itself has none: a disc drawn at one size has nothing
 * to vary. Unexported: knip only sees exports, and this shape is only
 * ever used inline inside `AudioVisualConfig`. */
interface CelestialStyle {
  readonly index: number;
  readonly radius: number; // world units
}

export interface AudioVisualConfig {
  // The render loop's elapsed-time clamp. Below the shortest phase Action
  // can produce (100ms at default config), so a phase watcher (cycle 16)
  // never misses a transition, and low enough that a backgrounded tab's
  // catch-up on return never runs an unbounded burst of physics steps in
  // one turn. See "Why the elapsed time is clamped" in
  // docs/05_audio_visual_layer.md.
  readonly maxFrameMs: number;
  readonly shellSize: number; // world units, radius
  readonly sparkSize: number; // world units, radius
  readonly sparkSpeed: NumberRange; // world units per second, outward
  readonly trailMaxPoints: number; // hard cap on trail points, oldest evicted first
  readonly trailSpacingMs: number; // time between two spark-trail samples
  readonly trailMaxAgeMs: number; // how long a shell's trail persists
  // The static sky, scenery and ground behind the fireworks, generated
  // once per page load from one seed. World-space and brightness values
  // only — every renderer needs these, so they sit at the top level while
  // the characters that draw them live under `ascii`. See
  // docs/06_world_backdrop.md.
  readonly backdrop: {
    // No sky brightness ever exceeds this, so the fireworks always read
    // clearly over the sky. With the default 10-character ramp, 0.25 keeps
    // every sky cell at or below the ramp's third character.
    readonly skyMaxBrightness: number;
    readonly starCount: NumberRange; // before a lit sky washes some out
    // World y floor for every body. Keep this above the ground's own
    // height range, or a body generates inside the landform and the ground
    // paints over it — wasted scenery rather than a bug, since ground
    // paints last.
    readonly celestialMinHeight: number;
    readonly groundPoints: number; // skyline control points; must be >= 2
    readonly groundHeight: NumberRange; // world y per control point
    // Ramp level for the mass below the ridge. Must exceed
    // skyMaxBrightness, or the ground lands on the same ramp character as
    // the horizon it meets and the landform becomes invisible.
    readonly groundFillBrightness: number;
  };
  // Rare, random movers that cross the sky behind the fireworks. World
  // space only, so any renderer can draw them. Grown one cycle at a time.
  // See docs/11_ambient_movers.md.
  readonly ambient: {
    // About one spawn in 1 / ratePerSecond seconds, whatever the frame
    // rate — `createAmbient` turns it into a chance per frame.
    readonly ratePerSecond: number;
    // A streak across the upper sky. World units throughout.
    readonly shootingStar: {
      readonly x: NumberRange; // start, across the world width
      readonly y: NumberRange; // start height, above the ground and bodies
      readonly speed: NumberRange; // units per second along its path
      // Vertical speed is `descent` times the speed, downward: 0 is level
      // and 1 is as fast down as it is across.
      readonly descent: number;
      readonly ttlMs: NumberRange; // time to live
      readonly brightness: number; // at spawn; it falls to 0 over the ttl
    };
    // A slow dot that crosses the sky level, at one brightness, and is gone
    // at the far edge.
    readonly satellite: {
      // The span it crosses. It starts at `min` going right, or at `max`
      // going left, and its time to live is the span over its speed.
      readonly x: NumberRange;
      readonly y: NumberRange; // height of the whole path
      readonly speed: NumberRange; // units per second
      readonly brightness: number; // constant
    };
  };
  // Only the ASCII adapter reads this — nested under its own key for the
  // same reason ControlConfig nests `keyboard`: the shape says who owns it.
  readonly ascii: {
    readonly columns: number;
    readonly rows: number;
    readonly ramp: string; // dimmest to brightest, one character per level
    // Fixed per kind rather than drawn from the ramp: a body is an object,
    // and an object should read as itself instead of as a brightness
    // level. In config rather than as module constants only so a test can
    // drive unusual glyphs and a hardcoded "O" fails.
    readonly backdropGlyphs: {
      readonly star: string;
      readonly moon: string;
      readonly planet: string;
      readonly ridge: string; // the skyline's topmost cell in each column
    };
  };
  // Only the emoji adapter reads this — nested under its own key for the
  // same reason ascii is. See docs/07_emoji_renderer.md.
  readonly emoji: {
    readonly columns: number;
    readonly rows: number;
    // One emoji wide, invisible against the page's dark background — the
    // emoji counterpart of ascii.ramp's leading space.
    readonly blank: string;
    readonly shell: string;
    // Faded to bright. trail[0] must equal blank: a trail's dimmest glyph
    // has to be the same blank a too-dim sprite would otherwise draw as,
    // or a decaying trail keeps winning its cell with a visible glyph long
    // after the ASCII renderer would show nothing there. See "Why a
    // trail's glyph ramp has to end on the blank" in
    // docs/07_emoji_renderer.md.
    readonly trail: readonly string[];
    // Nearest hue on the wheel wins, measured the short way round.
    readonly sparkHues: readonly {
      readonly hue: number;
      readonly glyph: string;
    }[];
    readonly desaturated: string; // below saturationFloor, hue means nothing
    readonly saturationFloor: number;
    readonly sky: readonly string[]; // dim to bright
    readonly backdropGlyphs: {
      readonly star: string;
      readonly moon: string;
      readonly planet: string;
      readonly ridge: string;
      readonly ground: string;
    };
  };
  // Only the pixel adapter reads this — nested under its own key for the
  // same reason ascii is. The pixel renderer is the emoji renderer with a
  // palette index where the glyph was, so this mirrors `emoji` field for
  // field. See docs/09_8bit_renderer.md.
  readonly pixel: {
    // Nearest hue on the wheel wins, measured the short way round -- the
    // same rule `emoji.sparkHues` uses, via the same `nearestHue`.
    readonly sparkHues: readonly {
      readonly hue: number;
      readonly index: number;
    }[];
    readonly desaturated: number; // below saturationFloor, hue means nothing
    readonly saturationFloor: number;
    readonly shell: number;
    // Faded to bright. trail[0] must equal blank: a trail's dimmest
    // index has to be the same blank a too-dim sprite would otherwise
    // draw as, or a decaying trail keeps winning its pixel with a
    // visible colour long after the ASCII renderer would show nothing
    // there. See "Why a trail's glyph ramp has to end on the blank" in
    // docs/07_emoji_renderer.md -- the same rule, one renderer over.
    readonly trail: readonly number[];
    // The grid the frame is painted onto. Recomputed at runtime from the
    // real viewport in main.ts (docs/09_8bit_renderer.md); these are only
    // a starting shape for tests and the config type.
    readonly columns: number;
    readonly rows: number;
    // The colour a pixel nothing draws on shows -- black, so it reads as
    // night sky rather than a visible "nothing here" colour.
    readonly blank: number;
    readonly sky: readonly number[]; // dim to bright
    // A disc, not a single pixel -- discCells already exists by the time
    // the backdrop needs it, and a one-pixel moon would undercut the
    // point of building this renderer at all.
    readonly bodies: {
      readonly star: CelestialStyle;
      readonly moon: CelestialStyle;
      readonly planet: CelestialStyle;
    };
    // One index, a silhouette -- see the default's own comment for why
    // this has to be darker than the sky, not brighter, unlike
    // asciiBackdrop's groundFillBrightness.
    readonly ground: number;
    readonly palette: readonly string[]; // 16 hex colours, indexed above
  };
  // Only the Web Audio adapter and its planning functions read this,
  // nested under its own key for the same reason ascii is.
  readonly audio: {
    // Scheduling headroom on the audio clock — a voice starts at
    // currentTime + lookaheadMs, giving the audio thread time to start it
    // exactly on time regardless of any delay in the calling JavaScript.
    readonly lookaheadMs: number;
    readonly masterGain: number; // 0..1, overall volume
    readonly maxVoices: number; // hard cap on simultaneous scheduled voices
    readonly crackleCount: number; // extra micro-bursts for the "crackle" timbre
    readonly burst: {
      readonly envelope: Envelope;
    };
    readonly launch: {
      readonly durationMs: number;
      readonly envelope: Envelope;
    };
    // The sustained whistle for the whole time a shell is airborne —
    // quiet, since it plays underneath everything else.
    readonly flight: {
      readonly envelope: Envelope;
      readonly gain: number;
    };
    // Tunables the silly set's planner needs driven by a test with an
    // unusual value — module constants in voices/silly.ts cover every
    // fixed shape ratio that doesn't. See docs/08_sound_effects.md.
    readonly sets: {
      readonly silly: {
        // Each of the flight voice's two detuned tones, before they sum —
        // together must not exceed flight.gain, or a shell in the air
        // gets louder than a burst.
        readonly flightVoiceGain: number;
        // How many extra voices follow a "soft" burst's own downward
        // glide, each one a bounce off the floor.
        readonly bounceCount: number;
        // Each bounce voice's gain and duration as a fraction of the
        // one before it — how fast the bounces die out.
        readonly bounceDecay: number;
        // 0..1: the odds a burst gets an extra surprise voice after it
        // finishes. Drawn per press, same as everything else silly.
        readonly gremlinChance: number;
      };
    };
  };
}

export const defaultAudioVisualConfig: AudioVisualConfig = Object.freeze({
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
});

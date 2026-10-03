import { describe, expect, it } from "vitest";
import { neonBackdrop, neonFrame, toCanvas } from "./neonScene.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Backdrop, Frame, Mover, Sprite } from "../types.ts";

// Cycle 3 (docs/12_neon_renderer.md): world space to canvas pixels. The
// canvas is not square, so the world is 100 units tall and `50 * width /
// height` units either side of the middle, the same widening the pixel
// renderer uses. A 300x120 canvas gives 125 units either side and 1.2
// pixels per world unit.

const canvas = { width: 300, height: 120 };

describe("toCanvas", () => {
  it("puts the top-left of the world at pixel (0, 0)", () => {
    expect(toCanvas({ x: -125, y: 100 }, canvas)).toEqual({ x: 0, y: 0 });
  });

  it("puts the bottom-right of the world at the canvas size", () => {
    expect(toCanvas({ x: 125, y: 0 }, canvas)).toEqual({ x: 300, y: 120 });
  });

  it("puts the middle of the world at the middle of the canvas", () => {
    expect(toCanvas({ x: 0, y: 50 }, canvas)).toEqual({ x: 150, y: 60 });
  });
});

// Cycle 4: one rule draws every sprite. A sprite that moves is a streak: a
// line from where it was `streakMs` ago to where it is now, along its
// velocity. (Cycle 5 gives a sprite that does not move a disc.)

// An unusual streakMs, not the default, so a hard-coded length cannot pass.
const neon = { ...defaultAudioVisualConfig.neon, streakMs: 100 };

function sprite(overrides: Partial<Sprite> = {}): Sprite {
  return {
    kind: "spark",
    position: { x: 10, y: 50, z: 0 },
    size: 0.5,
    color: { r: 0.2, g: 0.9, b: 0.4 },
    brightness: 0.7,
    velocity: { x: 30, y: -20, z: 0 },
    ...overrides,
  };
}

function frameOf(...sprites: Sprite[]): Frame {
  return { sprites, ambient: [] };
}

describe("neonFrame: a moving sprite", () => {
  it("is a streak from where it was streakMs ago to where it is", () => {
    const light = neonFrame(frameOf(sprite()), neon, canvas);

    // Tail: (10, 50) - (30, -20) * 0.1 s = (7, 52) -> pixel (158.4, 57.6).
    // Head: (10, 50) -> pixel (162, 60). Scale is 1.2 pixels per unit.
    expect(light.streaks).toHaveLength(1);
    const streak = light.streaks[0];
    expect(streak?.from.x).toBeCloseTo(158.4);
    expect(streak?.from.y).toBeCloseTo(57.6);
    expect(streak?.to.x).toBeCloseTo(162);
    expect(streak?.to.y).toBeCloseTo(60);
  });

  it("is as wide as the sprite, in pixels, and keeps its colour and brightness", () => {
    const light = neonFrame(frameOf(sprite()), neon, canvas);

    // Width: 2 * radius 0.5 * 1.2 pixels per unit.
    expect(light.streaks[0]?.width).toBeCloseTo(1.2);
    expect(light.streaks[0]?.color).toEqual({ r: 0.2, g: 0.9, b: 0.4 });
    expect(light.streaks[0]?.alpha).toBe(0.7);
  });

  it("is not also a disc", () => {
    const light = neonFrame(frameOf(sprite()), neon, canvas);

    expect(light.discs).toEqual([]);
  });
});

// Cycle 5: a sprite that does not move has no direction to streak along, so
// it is a disc. A shell trail point is the common case: Action records its
// position and it never moves.
describe("neonFrame: a sprite that does not move", () => {
  const still = sprite({
    kind: "trail",
    brightness: 0.4,
    velocity: { x: 0, y: 0, z: 0 },
  });

  it("is a disc at its position, as wide as the sprite", () => {
    const light = neonFrame(frameOf(still), neon, canvas);

    // World (10, 50) is pixel (162, 60). Radius: 0.5 * 1.2 pixels per unit.
    expect(light.discs).toHaveLength(1);
    const disc = light.discs[0];
    expect(disc?.centre.x).toBeCloseTo(162);
    expect(disc?.centre.y).toBeCloseTo(60);
    expect(disc?.radius).toBeCloseTo(0.6);
    expect(disc?.color).toEqual({ r: 0.2, g: 0.9, b: 0.4 });
    expect(disc?.alpha).toBe(0.4);
  });

  it("is not also a streak", () => {
    const light = neonFrame(frameOf(still), neon, canvas);

    expect(light.streaks).toEqual([]);
  });

  it("sits beside the streaks of the sprites that move", () => {
    const light = neonFrame(frameOf(sprite(), still, sprite()), neon, canvas);

    expect(light.streaks).toHaveLength(2);
    expect(light.discs).toHaveLength(1);
  });
});

// Cycle 6: a shell is the brightest thing in the sky until it bursts, so
// besides its streak it gets a small hot core: a disc at its head, drawn in
// `shellCore.color` and `shellCore.scale` times the shell's own size.
describe("neonFrame: a shell", () => {
  // Unusual values, so a hard-coded scale or colour cannot pass.
  const coreNeon = {
    ...neon,
    shellCore: { scale: 3, color: { r: 0.9, g: 0.8, b: 1 } },
  };
  const shell = sprite({
    kind: "shell",
    brightness: 0.8,
    velocity: { x: 0, y: 40, z: 0 },
  });

  it("is a streak along its velocity, like any moving sprite", () => {
    const light = neonFrame(frameOf(shell), coreNeon, canvas);

    expect(light.streaks).toHaveLength(1);
    expect(light.streaks[0]?.width).toBeCloseTo(1.2);
    expect(light.streaks[0]?.color).toEqual({ r: 0.2, g: 0.9, b: 0.4 });
  });

  it("also has a core disc at its head, in the core colour and scale", () => {
    const light = neonFrame(frameOf(shell), coreNeon, canvas);

    // Head: world (10, 50) is pixel (162, 60). Radius: 0.5 * 3 * 1.2.
    expect(light.discs).toHaveLength(1);
    const core = light.discs[0];
    expect(core?.centre.x).toBeCloseTo(162);
    expect(core?.centre.y).toBeCloseTo(60);
    expect(core?.radius).toBeCloseTo(1.8);
    expect(core?.color).toEqual({ r: 0.9, g: 0.8, b: 1 });
    expect(core?.alpha).toBe(0.8);
  });
});

// Cycle 7: an ambient mover follows the same rule with its own tail time.
// `moverTailMs` says how long a mover's tail is, in milliseconds of travel:
// a shooting star has one, so it is a streak. A satellite has 0, so its
// streak has no length and it is a dot.
describe("neonFrame: ambient movers", () => {
  // Unusual values, so a hard-coded colour, size or tail cannot pass.
  const moverNeon = {
    ...neon,
    moverColor: { r: 0.3, g: 0.6, b: 1 },
    moverSize: 0.5,
    moverTailMs: { shootingStar: 200, satellite: 0 },
  };

  function mover(overrides: Partial<Mover> = {}): Mover {
    return {
      kind: "shootingStar",
      position: { x: 10, y: 50, z: 0 },
      velocity: { x: -40, y: -30, z: 0 },
      brightness: 0.5,
      ...overrides,
    };
  }

  it("draws a shooting star as a streak along its velocity", () => {
    const light = neonFrame(
      { sprites: [], ambient: [mover()] },
      moverNeon,
      canvas,
    );

    // Tail: (10, 50) - (-40, -30) * 0.2 s = (18, 56) -> pixel (171.6, 52.8).
    // Head: (10, 50) -> pixel (162, 60). Width: 2 * 0.5 * 1.2.
    expect(light.streaks).toHaveLength(1);
    const streak = light.streaks[0];
    expect(streak?.from.x).toBeCloseTo(171.6);
    expect(streak?.from.y).toBeCloseTo(52.8);
    expect(streak?.to.x).toBeCloseTo(162);
    expect(streak?.to.y).toBeCloseTo(60);
    expect(streak?.width).toBeCloseTo(1.2);
    expect(streak?.color).toEqual({ r: 0.3, g: 0.6, b: 1 });
    expect(streak?.alpha).toBe(0.5);
    expect(light.discs).toEqual([]);
  });

  it("draws a satellite as a dot, although it moves", () => {
    const satellite = mover({
      kind: "satellite",
      velocity: { x: 20, y: 0, z: 0 },
      brightness: 0.6,
    });

    const light = neonFrame(
      { sprites: [], ambient: [satellite] },
      moverNeon,
      canvas,
    );

    // Radius: 0.5 * 1.2.
    expect(light.streaks).toEqual([]);
    expect(light.discs).toHaveLength(1);
    const dot = light.discs[0];
    expect(dot?.centre.x).toBeCloseTo(162);
    expect(dot?.centre.y).toBeCloseTo(60);
    expect(dot?.radius).toBeCloseTo(0.6);
    expect(dot?.color).toEqual({ r: 0.3, g: 0.6, b: 1 });
    expect(dot?.alpha).toBe(0.6);
  });
});

// Cycle 8: the ridge. `Backdrop.ground` covers x from -50 to 50, but the
// canvas shows `50 * width / height` units either side of the middle, so on
// a wide screen the raw points stop short of both edges. The ridge is the
// ground points that are on the canvas, plus a point at each canvas edge at
// the height `groundHeightAt` gives there.
describe("neonBackdrop: the ridge", () => {
  const backdrop: Backdrop = {
    sky: { horizon: 0, zenith: 0 },
    bodies: [],
    ground: [
      { x: -50, height: 10 },
      { x: 0, height: 30 },
      { x: 50, height: 20 },
    ],
  };

  it("runs edge to edge on a wide canvas", () => {
    // 400x100: 200 units either side, 1 pixel per unit. Pixel x = 200 + x,
    // pixel y = 100 - height. The ground is held flat beyond +-50.
    const { ridge } = neonBackdrop(backdrop, neon, { width: 400, height: 100 });

    expect(ridge).toEqual([
      { x: 0, y: 90 },
      { x: 150, y: 90 },
      { x: 200, y: 70 },
      { x: 250, y: 80 },
      { x: 400, y: 80 },
    ]);
  });

  it("drops the ground points that are off the canvas, and meets each edge at the height there", () => {
    // 40x100: 20 units either side. The points at +-50 are off the canvas.
    // At x = -20 the ground is 10 + 20 * (30 - 10) / 50 = 22. At x = 20 it is
    // 30 - 10 * 20 / 50 = 26.
    const { ridge } = neonBackdrop(backdrop, neon, { width: 40, height: 100 });

    expect(ridge).toEqual([
      { x: 0, y: 78 },
      { x: 20, y: 70 },
      { x: 40, y: 74 },
    ]);
  });
});

// Cycle 9: stars and the two bodies that are not stars. A star is a small
// cross, `starArm` long each way. The moon and the planet are rings of the
// radius `bodies` gives. All lengths are world units, scaled to pixels.
describe("neonBackdrop: stars and rings", () => {
  // Unusual values, so a hard-coded arm or radius cannot pass.
  const bodyNeon = { ...neon, starArm: 2, bodies: { moon: 10, planet: 4 } };
  const backdrop: Backdrop = {
    sky: { horizon: 0, zenith: 0 },
    ground: [
      { x: -50, height: 0 },
      { x: 50, height: 0 },
    ],
    bodies: [
      { kind: "star", position: { x: -20, y: 80, z: 0 } },
      { kind: "moon", position: { x: 30, y: 70, z: 0 } },
      { kind: "planet", position: { x: -60, y: 40, z: 0 } },
      { kind: "star", position: { x: 0, y: 50, z: 0 } },
    ],
  };

  it("gives each star a cross at its position, scaled to pixels", () => {
    const { stars } = neonBackdrop(backdrop, bodyNeon, canvas);

    // World (-20, 80) is pixel (126, 24). Arm: 2 * 1.2. World (0, 50) is
    // pixel (150, 60).
    expect(stars).toHaveLength(2);
    expect(stars[0]?.centre.x).toBeCloseTo(126);
    expect(stars[0]?.centre.y).toBeCloseTo(24);
    expect(stars[0]?.arm).toBeCloseTo(2.4);
    expect(stars[1]?.centre.x).toBeCloseTo(150);
    expect(stars[1]?.centre.y).toBeCloseTo(60);
  });

  it("gives the moon and the planet a ring each, of the radius for its kind", () => {
    const { rings } = neonBackdrop(backdrop, bodyNeon, canvas);

    // Moon: world (30, 70) is pixel (186, 36), radius 10 * 1.2. Planet:
    // world (-60, 40) is pixel (78, 72), radius 4 * 1.2.
    expect(rings).toHaveLength(2);
    expect(rings[0]?.centre.x).toBeCloseTo(186);
    expect(rings[0]?.centre.y).toBeCloseTo(36);
    expect(rings[0]?.radius).toBeCloseTo(12);
    expect(rings[1]?.centre.x).toBeCloseTo(78);
    expect(rings[1]?.centre.y).toBeCloseTo(72);
    expect(rings[1]?.radius).toBeCloseTo(4.8);
  });
});

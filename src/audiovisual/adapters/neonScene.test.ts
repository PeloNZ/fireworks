import { describe, expect, it } from "vitest";
import { neonFrame, toCanvas } from "./neonScene.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Frame, Sprite } from "../types.ts";

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

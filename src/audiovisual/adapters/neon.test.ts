import { describe, expect, it } from "vitest";
import { createNeonRenderer } from "./neon.ts";
import type { Canvas2DLike } from "./neon.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Frame, Sprite } from "../types.ts";

// Cycle 10 (docs/12_neon_renderer.md): the first thing the player draws is a
// streak, in a Display P3 colour. The port is a slice of the canvas context;
// the fake records each call and each property write, in order, as
// `name(args)` and `name = value`. A canvas is 400x100 here, so one world
// unit is exactly one pixel and the logged numbers are exact.

function createSurface() {
  const log: string[] = [];
  const context = new Proxy(
    {},
    {
      get:
        (_target, name) =>
        (...args: unknown[]) => {
          log.push(`${String(name)}(${args.join(", ")})`);
        },
      set: (_target, name, value) => {
        log.push(`${String(name)} = ${String(value)}`);
        return true;
      },
    },
  ) as unknown as Canvas2DLike;
  return { surface: { context, width: 400, height: 100 }, log };
}

// An unusual streakMs, not the default, so a hard-coded length cannot pass.
const config = { ...defaultAudioVisualConfig.neon, streakMs: 1000 };

function spark(overrides: Partial<Sprite> = {}): Sprite {
  return {
    kind: "spark",
    position: { x: 10, y: 50, z: 0 },
    size: 0.5,
    color: { r: 1, g: 0.5, b: 0 },
    brightness: 0.25,
    velocity: { x: 20, y: 0, z: 0 },
    ...overrides,
  };
}

function frameOf(...sprites: Sprite[]): Frame {
  return { sprites, ambient: [] };
}

describe("createNeonRenderer: a streak", () => {
  it("strokes a line from the tail to the head, as wide as the sprite", () => {
    const { surface, log } = createSurface();
    const render = createNeonRenderer({ light: surface, config });

    render(frameOf(spark()));

    // Head: world (10, 50) is pixel (210, 50). Tail: 1 s of travel back,
    // world (-10, 50), is pixel (190, 50). Width: 2 * 0.5 * 1.
    expect(log).toContain("lineWidth = 1");
    expect(log).toContain("moveTo(190, 50)");
    expect(log).toContain("lineTo(210, 50)");
    expect(log).toContain("stroke()");
  });

  it("writes its colour as Display P3, with the brightness as alpha", () => {
    const { surface, log } = createSurface();
    const render = createNeonRenderer({ light: surface, config });

    render(frameOf(spark()));

    expect(log).toContain("strokeStyle = color(display-p3 1 0.5 0 / 0.25)");
  });

  it("gives the line round ends", () => {
    const { surface, log } = createSurface();
    const render = createNeonRenderer({ light: surface, config });

    render(frameOf(spark()));

    expect(log).toContain("lineCap = round");
  });
});

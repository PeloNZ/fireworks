import { describe, expect, it } from "vitest";
import { createNeonRenderer } from "./neon.ts";
import type { Canvas2DLike } from "./neon.ts";
import { defaultSettings } from "../../config.ts";
import type { Backdrop, Frame, Sprite } from "../types.ts";

// The player replays the scene onto a canvas port. The port is a slice of the
// canvas context; the fake records each call and each property write, in
// order, as `name(args)` and `name = value`. A canvas is 400x100 here, so one
// world unit is exactly one pixel and the logged numbers are exact.

// `timeline` gets every line of every surface, prefixed with the surface name,
// so a test can check the order across surfaces.
function createSurface(
  name: string,
  width: number,
  height: number,
  timeline: string[],
) {
  const log: string[] = [];
  const record = (line: string) => {
    log.push(line);
    timeline.push(`${name}: ${line}`);
  };
  const context = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        (...args: unknown[]) => {
          record(`${String(property)}(${args.join(", ")})`);
        },
      set: (_target, property, value) => {
        record(`${String(property)} = ${String(value)}`);
        return true;
      },
    },
  ) as unknown as Canvas2DLike<string>;
  return { surface: { context, source: name, width, height }, log };
}

// Asserts that `lines` appear in `log` one right after another.
function expectSequence(log: readonly string[], lines: readonly string[]) {
  const start = log.indexOf(lines[0] ?? "");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(log.slice(start, start + lines.length)).toEqual(lines);
}

// Unusual values, not the defaults, so a hard-coded one cannot pass.
const config = {
  ...defaultSettings.audiovisual.neon,
  streakMs: 1000,
  starArm: 5,
  starColor: { r: 0.1, g: 0.2, b: 0.3 },
  starWidth: 0.4,
  bodies: { moon: 10, planet: 3 },
  ringColor: { r: 0.4, g: 0.5, b: 0.6 },
  ringWidth: 0.8,
  groundFill: { r: 0.05, g: 0.06, b: 0.07 },
  ridgeColor: { r: 0.7, g: 0.8, b: 0.9 },
  ridgeWidth: 0.6,
  bloom: { quarterAlpha: 0.6, eighthAlpha: 0.3 },
};

const backdrop: Backdrop = {
  sky: { horizon: 0, zenith: 0 },
  ground: [
    { x: -50, height: 10 },
    { x: 50, height: 10 },
  ],
  bodies: [
    { kind: "star", position: { x: -20, y: 80, z: 0 } },
    { kind: "moon", position: { x: 30, y: 70, z: 0 } },
  ],
};

function build() {
  const timeline: string[] = [];
  const light = createSurface("light", 400, 100, timeline);
  const background = createSurface("background", 400, 100, timeline);
  const quarter = createSurface("quarter", 100, 25, timeline);
  const eighth = createSurface("eighth", 50, 13, timeline);
  const render = createNeonRenderer({
    light: light.surface,
    background: background.surface,
    quarter: quarter.surface,
    eighth: eighth.surface,
    backdrop,
    config,
  });
  return {
    render,
    timeline,
    light: light.log,
    background: background.log,
    quarter: quarter.log,
    eighth: eighth.log,
  };
}

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

// Cycle 10 (docs/12_neon_renderer.md): the first thing the player draws on
// the light surface is a streak, in a Display P3 colour.
describe("createNeonRenderer: a streak", () => {
  it("strokes a line from the tail to the head, as wide as the sprite", () => {
    const { render, light } = build();

    render(frameOf(spark()));

    // Head: world (10, 50) is pixel (210, 50). Tail: 1 s of travel back,
    // world (-10, 50), is pixel (190, 50). Width: 2 * 0.5 * 1.
    expect(light).toContain("lineWidth = 1");
    expect(light).toContain("moveTo(190, 50)");
    expect(light).toContain("lineTo(210, 50)");
    expect(light).toContain("stroke()");
  });

  it("writes its colour as Display P3, with the brightness as alpha", () => {
    const { render, light } = build();

    render(frameOf(spark()));

    expect(light).toContain("strokeStyle = color(display-p3 1 0.5 0 / 0.25)");
  });

  it("gives the line round ends", () => {
    const { render, light } = build();

    render(frameOf(spark()));

    expect(light).toContain("lineCap = round");
  });
});

// Cycle 11: the backdrop surface is painted once, when the renderer is made.
// A black sky, the ground filled under the ridge, a cross for each star and
// a ring for the moon and the planet. None of it is on the light surface, so
// none of it blooms.
describe("createNeonRenderer: the backdrop surface", () => {
  it("starts with a black sky over the whole surface", () => {
    const { background } = build();

    expect(background.slice(0, 2)).toEqual([
      "fillStyle = color(display-p3 0 0 0 / 1)",
      "fillRect(0, 0, 400, 100)",
    ]);
  });

  it("fills the ground under the ridge, edge to edge, down to the bottom", () => {
    const { background } = build();

    // The ridge is world height 10 at every point: pixel y 90.
    expectSequence(background, [
      "fillStyle = color(display-p3 0.05 0.06 0.07 / 1)",
      "beginPath()",
      "moveTo(0, 90)",
      "lineTo(150, 90)",
      "lineTo(250, 90)",
      "lineTo(400, 90)",
      "lineTo(400, 100)",
      "lineTo(0, 100)",
      "closePath()",
      "fill()",
    ]);
  });

  it("strokes each star as a cross", () => {
    const { background } = build();

    // World (-20, 80) is pixel (180, 20). Arm 5. Width 0.4 * 1.
    expectSequence(background, [
      "strokeStyle = color(display-p3 0.1 0.2 0.3 / 1)",
      "lineWidth = 0.4",
      "beginPath()",
      "moveTo(175, 20)",
      "lineTo(185, 20)",
      "moveTo(180, 15)",
      "lineTo(180, 25)",
      "stroke()",
    ]);
  });

  it("strokes the moon as a ring", () => {
    const { background } = build();

    // World (30, 70) is pixel (230, 30). Radius 10. Width 0.8 * 1.
    expectSequence(background, [
      "strokeStyle = color(display-p3 0.4 0.5 0.6 / 1)",
      "lineWidth = 0.8",
      "beginPath()",
      `arc(230, 30, 10, 0, ${String(2 * Math.PI)})`,
      "stroke()",
    ]);
  });

  it("paints once, never again per frame", () => {
    const { render, background } = build();
    const paintedAtConstruction = background.length;

    render(frameOf(spark()));
    render(frameOf());

    expect(paintedAtConstruction).toBeGreaterThan(0);
    expect(background).toHaveLength(paintedAtConstruction);
  });
});

// Cycle 12: the light surface is redrawn every frame. Clear it, switch to
// additive blending so overlapping light adds up towards white, then draw
// the ridge, the streaks and the discs, in that order. The ridge is drawn
// here, not on the backdrop surface, so that it glows with the bloom.
describe("createNeonRenderer: the light surface", () => {
  const trail = spark({
    kind: "trail",
    color: { r: 0.2, g: 0.3, b: 0.4 },
    brightness: 0.5,
    velocity: { x: 0, y: 0, z: 0 },
  });

  it("clears the surface, then blends additively, at the start of each frame", () => {
    const { render, light } = build();

    render(frameOf(spark()));

    expect(light.slice(0, 2)).toEqual([
      "clearRect(0, 0, 400, 100)",
      "globalCompositeOperation = lighter",
    ]);
  });

  it("starts every frame the same way", () => {
    const { render, light } = build();

    render(frameOf());
    render(frameOf());

    expect(light.filter((line) => line.startsWith("clearRect"))).toHaveLength(
      2,
    );
    expect(
      light.filter((line) => line === "globalCompositeOperation = lighter"),
    ).toHaveLength(2);
  });

  it("strokes the ridge, even in a frame with no sprites", () => {
    const { render, light } = build();

    render(frameOf());

    // The ridge is world height 10 at every point: pixel y 90.
    expectSequence(light, [
      "strokeStyle = color(display-p3 0.7 0.8 0.9 / 1)",
      "lineWidth = 0.6",
      "beginPath()",
      "moveTo(0, 90)",
      "lineTo(150, 90)",
      "lineTo(250, 90)",
      "lineTo(400, 90)",
      "stroke()",
    ]);
  });

  it("fills a disc for a sprite that does not move", () => {
    const { render, light } = build();

    render(frameOf(trail));

    // World (10, 50) is pixel (210, 50). Radius: 0.5 * 1.
    expectSequence(light, [
      "fillStyle = color(display-p3 0.2 0.3 0.4 / 0.5)",
      "beginPath()",
      `arc(210, 50, 0.5, 0, ${String(2 * Math.PI)})`,
      "fill()",
    ]);
  });

  it("draws the ridge first, then the streaks, then the discs", () => {
    const { render, light } = build();

    render(frameOf(trail, spark()));

    const ridge = light.indexOf("moveTo(0, 90)");
    const streak = light.indexOf("moveTo(190, 50)");
    const disc = light.indexOf(`arc(210, 50, 0.5, 0, ${String(2 * Math.PI)})`);
    expect(ridge).toBeGreaterThanOrEqual(0);
    expect(streak).toBeGreaterThan(ridge);
    expect(disc).toBeGreaterThan(streak);
  });
});

// Cycle 13: the bloom. Copy the light surface to a quarter-size surface and
// that to an eighth-size one, then draw both back over the light surface at
// full size, added on. Scaling a small copy up blurs it, and it works in
// Safari, which has no `ctx.filter`. The bloom comes last, so it also
// brightens the ridge, the streaks and the discs just drawn.
describe("createNeonRenderer: the bloom", () => {
  it("copies the light surface down to the quarter surface", () => {
    const { render, quarter } = build();

    render(frameOf(spark()));

    expect(quarter).toEqual([
      "clearRect(0, 0, 100, 25)",
      "drawImage(light, 0, 0, 100, 25)",
    ]);
  });

  it("copies the quarter surface down to the eighth surface", () => {
    const { render, eighth } = build();

    render(frameOf(spark()));

    expect(eighth).toEqual([
      "clearRect(0, 0, 50, 13)",
      "drawImage(quarter, 0, 0, 50, 13)",
    ]);
  });

  it("ends each frame by drawing both copies over the light surface, then resetting the blend", () => {
    const { render, timeline } = build();

    render(frameOf(spark()));

    expect(timeline.slice(-10)).toEqual([
      "quarter: clearRect(0, 0, 100, 25)",
      "quarter: drawImage(light, 0, 0, 100, 25)",
      "eighth: clearRect(0, 0, 50, 13)",
      "eighth: drawImage(quarter, 0, 0, 50, 13)",
      "light: globalAlpha = 0.6",
      "light: drawImage(quarter, 0, 0, 400, 100)",
      "light: globalAlpha = 0.3",
      "light: drawImage(eighth, 0, 0, 400, 100)",
      "light: globalAlpha = 1",
      "light: globalCompositeOperation = source-over",
    ]);
  });

  it("blooms every frame, including one with no sprites", () => {
    const { render, quarter } = build();

    render(frameOf());
    render(frameOf());

    expect(quarter).toHaveLength(4);
  });
});

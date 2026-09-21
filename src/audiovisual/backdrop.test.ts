import { describe, expect, it } from "vitest";
import {
  buildBodies,
  buildGround,
  buildSky,
  groundHeightAt,
  skyBrightnessAt,
} from "./backdrop.ts";
import { defaultAudioVisualConfig } from "./config.ts";
import type { GroundPoint, SkyGradient } from "./types.ts";

// Cycle 1 (docs/06_world_backdrop.md): the sky gradient as a plain
// function of world height. Two ends and a straight line between them —
// the same linear interpolation lerpVec3 does for a shell's position,
// applied to one number instead of three.

describe("skyBrightnessAt", () => {
  // Neither end is a config default, so a hardcoded brightness fails, and
  // the two differ enough that a gradient interpolated the wrong way round
  // fails everywhere except the midpoint.
  const sky: SkyGradient = { horizon: 0.4, zenith: 0.1 };

  it("returns the horizon's brightness at the bottom of world space", () => {
    expect(skyBrightnessAt(sky, 0)).toBeCloseTo(0.4);
  });

  it("returns the zenith's brightness at the top of world space", () => {
    expect(skyBrightnessAt(sky, 100)).toBeCloseTo(0.1);
  });

  it("returns the exact midpoint halfway up", () => {
    expect(skyBrightnessAt(sky, 50)).toBeCloseTo(0.25);
  });

  it("interpolates proportionally at a height that is not the midpoint", () => {
    // A quarter of the way up: 0.4 + (0.1 - 0.4) * 0.25. Driven off the
    // midpoint so an implementation that always blends half and half fails.
    expect(skyBrightnessAt(sky, 25)).toBeCloseTo(0.325);
  });
});

// Cycle 2: the seeded sky. One scalar draw for the horizon and one for the
// zenith as a fraction of it, which is what makes "zenith is never brighter
// than horizon" structural rather than asserted-and-hoped.

describe("buildSky", () => {
  // An unusual cap, well below the default 0.25, so an implementation that
  // hardcodes the default fails.
  const config = {
    ...defaultAudioVisualConfig.backdrop,
    skyMaxBrightness: 0.11,
  };

  // 200 seeds rather than one: the cap and the zenith relationship are
  // claims about every sky the generator can produce, not about one of them.
  const skies = Array.from({ length: 200 }, (_unused, index) =>
    buildSky(index + 1, config),
  );

  it("never generates a sky brighter than the configured cap", () => {
    for (const sky of skies) {
      expect(sky.horizon).toBeLessThan(config.skyMaxBrightness);
    }
  });

  it("never generates a zenith brighter than its own horizon, so no sky glows at the top", () => {
    for (const sky of skies) {
      expect(sky.zenith).toBeLessThanOrEqual(sky.horizon);
    }
  });

  it("reaches close to the cap on some seed, proving the cap is the config value and not a smaller fixed number", () => {
    const brightest = Math.max(...skies.map((sky) => sky.horizon));

    expect(brightest).toBeGreaterThan(0.09);
  });

  it("returns the same sky for the same seed", () => {
    expect(buildSky(42, config)).toEqual(buildSky(42, config));
  });

  it("returns a different sky for a different seed", () => {
    expect(buildSky(1, config)).not.toEqual(buildSky(2, config));
  });
});

// Cycle 3: the sky's scenery. Stars first, then the planet, then the moon
// — that array order *is* the paint order, which is how a star sharing the
// moon's cell loses to it without any overlap test existing anywhere.

// A black sky washes nothing out (cycle 4), so these cycle-3 assertions
// are about the star count the config asks for, undisturbed.
const blackSky: SkyGradient = { horizon: 0, zenith: 0 };

describe("buildBodies", () => {
  // A pinned star count and an unusually high floor, neither a default, so
  // a hardcoded count or a hardcoded height fails.
  const config = {
    ...defaultAudioVisualConfig.backdrop,
    starCount: { min: 3, max: 3 },
    celestialMinHeight: 60,
  };

  it("returns the configured number of stars plus one planet and one moon, in paint order", () => {
    const bodies = buildBodies(7, config, blackSky);

    expect(bodies).toHaveLength(5);
    expect(bodies.map((body) => body.kind)).toEqual([
      "star",
      "star",
      "star",
      "planet",
      "moon",
    ]);
  });

  it("places every body inside the renderable world box, above the configured floor", () => {
    const bodies = buildBodies(7, config, blackSky);

    for (const body of bodies) {
      // Half-open at the top and the right: rasteriseFrame clips x = 50 and
      // y = 100 exactly, so a body generated there would silently vanish.
      expect(body.position.x).toBeGreaterThanOrEqual(-50);
      expect(body.position.x).toBeLessThan(50);
      expect(body.position.y).toBeGreaterThanOrEqual(60);
      expect(body.position.y).toBeLessThan(100);
      expect(body.position.z).toBe(0);
    }
  });

  it("takes its floor from config, not a fixed height", () => {
    const highFloor = { ...config, celestialMinHeight: 99 };

    for (const body of buildBodies(7, highFloor, blackSky)) {
      expect(body.position.y).toBeGreaterThanOrEqual(99);
      expect(body.position.y).toBeLessThan(100);
    }
  });

  it("returns the same bodies for the same seed", () => {
    expect(buildBodies(42, config, blackSky)).toEqual(
      buildBodies(42, config, blackSky),
    );
  });

  it("returns different positions for a different seed", () => {
    expect(buildBodies(1, config, blackSky)).not.toEqual(
      buildBodies(2, config, blackSky),
    );
  });
});

// Cycle 4: decision 5 — a lit horizon washes out the stars, so a sky reads
// as one coherent scene rather than a random pile of parts. With fixed
// glyphs a star has no brightness to dim, so "washed out" can only mean
// fewer of them.

describe("buildBodies — a lit sky washes out the stars", () => {
  const config = {
    ...defaultAudioVisualConfig.backdrop,
    starCount: { min: 20, max: 20 }, // pinned, so only the sky can change it
    skyMaxBrightness: 0.25,
  };
  const nearBlack: SkyGradient = { horizon: 0.02, zenith: 0 };
  const lit: SkyGradient = { horizon: 0.24, zenith: 0 };

  const starsUnder = (sky: SkyGradient): number =>
    buildBodies(7, config, sky).filter((body) => body.kind === "star").length;

  it("returns strictly fewer stars under a lit sky than under a near-black one, from the same seed", () => {
    // Asserted as the invariant rather than as two pinned counts — the same
    // way sparks.test.ts asserts a wider jitter without pinning randomness.
    expect(starsUnder(lit)).toBeLessThan(starsUnder(nearBlack));
  });

  it("keeps the moon and the planet whatever the sky is doing, since they are scenery and not weather", () => {
    for (const sky of [nearBlack, lit]) {
      const kinds = buildBodies(7, config, sky).map((body) => body.kind);

      expect(kinds.filter((kind) => kind === "moon")).toHaveLength(1);
      expect(kinds.filter((kind) => kind === "planet")).toHaveLength(1);
    }
  });

  it("treats a zero brightness cap as no sunset at all, rather than dividing by zero", () => {
    // The washout is a fraction of skyMaxBrightness, so a cap of 0 would
    // make it 0/0. Same class of edge as sparkPosition's drag of zero, and
    // reachable the same way: docs/06 tells a reader to set this to 0 to
    // check the sky is really black.
    const noSky = { ...config, skyMaxBrightness: 0 };

    const stars = buildBodies(7, noSky, blackSky).filter(
      (body) => body.kind === "star",
    );

    expect(stars).toHaveLength(20);
  });
});

// Cycle 5: the skyline as a height field — a short list of control points
// in world space, not a set of cells. The points are the data; what
// resolution anyone samples them at is the renderer's business, which is
// what lets an 80-column grid and a future canvas trace the same hills.

describe("buildGround", () => {
  it("spans the full world width with the configured number of control points", () => {
    // A degenerate height range pins every height, which makes the whole
    // return value assertable exactly rather than by range. An unusual
    // point count, so a hardcoded number of points fails.
    const config = {
      ...defaultAudioVisualConfig.backdrop,
      groundPoints: 5,
      groundHeight: { min: 7, max: 7 },
    };

    // x = 50 is included on purpose. These are control points to sample,
    // not positions to draw, so the half-open render box does not apply —
    // and a polyline stopping short of 50 would leave the rightmost
    // columns extrapolating off the end of the data.
    expect(buildGround(7, config)).toEqual([
      { x: -50, height: 7 },
      { x: -25, height: 7 },
      { x: 0, height: 7 },
      { x: 25, height: 7 },
      { x: 50, height: 7 },
    ]);
  });

  it("draws each point's height separately, rather than one height shared by all of them", () => {
    const config = {
      ...defaultAudioVisualConfig.backdrop,
      groundPoints: 9,
      groundHeight: { min: 30, max: 31 },
    };

    const heights = buildGround(7, config).map((point) => point.height);

    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(30);
      expect(height).toBeLessThan(31);
    }
    expect(new Set(heights).size).toBeGreaterThan(1);
  });

  it("returns the same ground for the same seed", () => {
    const config = defaultAudioVisualConfig.backdrop;

    expect(buildGround(42, config)).toEqual(buildGround(42, config));
  });

  it("returns different ground for a different seed", () => {
    const config = defaultAudioVisualConfig.backdrop;

    expect(buildGround(1, config)).not.toEqual(buildGround(2, config));
  });
});

// Cycle 6: sampling the height field. This is the one place the
// interpolation rule lives, so switching from straight lines to something
// crisper later is a change here and nowhere else.

describe("groundHeightAt", () => {
  // Hand-made and deliberately asymmetric — a ridge that rises then falls,
  // so an implementation that always returns the first or last height, or
  // that reads the polyline backwards, fails.
  const ground: readonly GroundPoint[] = [
    { x: -50, height: 10 },
    { x: 0, height: 30 },
    { x: 50, height: 20 },
  ];

  it("returns a control point's own height at its own x", () => {
    expect(groundHeightAt(ground, -50)).toBeCloseTo(10);
    expect(groundHeightAt(ground, 0)).toBeCloseTo(30);
    expect(groundHeightAt(ground, 50)).toBeCloseTo(20);
  });

  it("returns the midpoint halfway between two control points", () => {
    expect(groundHeightAt(ground, -25)).toBeCloseTo(20);
    expect(groundHeightAt(ground, 25)).toBeCloseTo(25);
  });

  it("interpolates proportionally at a point that is not a midpoint", () => {
    // A quarter along the first segment: 10 + (30 - 10) * 0.25.
    expect(groundHeightAt(ground, -37.5)).toBeCloseTo(15);
  });

  it("clamps outside the polyline instead of extrapolating off the end of it", () => {
    expect(groundHeightAt(ground, -1000)).toBeCloseTo(10);
    expect(groundHeightAt(ground, 1000)).toBeCloseTo(20);
  });
});

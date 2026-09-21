import { describe, expect, it } from "vitest";
import { buildBodies, buildSky, skyBrightnessAt } from "./backdrop.ts";
import { defaultAudioVisualConfig } from "./config.ts";
import type { SkyGradient } from "./types.ts";

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

describe("buildBodies", () => {
  // A pinned star count and an unusually high floor, neither a default, so
  // a hardcoded count or a hardcoded height fails.
  const config = {
    ...defaultAudioVisualConfig.backdrop,
    starCount: { min: 3, max: 3 },
    celestialMinHeight: 60,
  };

  it("returns the configured number of stars plus one planet and one moon, in paint order", () => {
    const bodies = buildBodies(7, config);

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
    const bodies = buildBodies(7, config);

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

    for (const body of buildBodies(7, highFloor)) {
      expect(body.position.y).toBeGreaterThanOrEqual(99);
      expect(body.position.y).toBeLessThan(100);
    }
  });

  it("returns the same bodies for the same seed", () => {
    expect(buildBodies(42, config)).toEqual(buildBodies(42, config));
  });

  it("returns different positions for a different seed", () => {
    expect(buildBodies(1, config)).not.toEqual(buildBodies(2, config));
  });
});

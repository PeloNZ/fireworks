import { describe, expect, it } from "vitest";
import { defaultActionConfig } from "./config.ts";
import { pickLaunch } from "./launch.ts";
import { magnitude } from "./vector.ts";
import type { Seeds } from "./types.ts";

// Cycle 5 (docs/04_plan_action_layer.md): pickLaunch is the first place a
// Seeds pair turns into real firework values. The split that makes "one
// key always feels like that key" work: angle comes from the key seed
// alone, everything else from the press seed.

function seeds(overrides: Partial<Seeds> = {}): Seeds {
  return { key: 1, press: 2, ...overrides };
}

describe("pickLaunch", () => {
  it("keeps speed inside the configured range", () => {
    const config = {
      ...defaultActionConfig,
      launchSpeed: { min: 1000, max: 1001 },
    };

    const launch = pickLaunch(seeds(), config);

    expect(magnitude(launch.velocity)).toBeGreaterThanOrEqual(1000);
    expect(magnitude(launch.velocity)).toBeLessThanOrEqual(1001);
  });

  it("keeps thrust inside the configured range", () => {
    const config = { ...defaultActionConfig, thrust: { min: 777, max: 778 } };

    const launch = pickLaunch(seeds(), config);

    expect(launch.thrust).toBeGreaterThanOrEqual(777);
    expect(launch.thrust).toBeLessThanOrEqual(778);
  });

  it("keeps fuelMs inside the configured range", () => {
    const config = { ...defaultActionConfig, fuelMs: { min: 6000, max: 6001 } };

    const launch = pickLaunch(seeds(), config);

    expect(launch.fuelMs).toBeGreaterThanOrEqual(6000);
    expect(launch.fuelMs).toBeLessThanOrEqual(6001);
  });

  it("keeps fuseMs inside the configured range", () => {
    const config = { ...defaultActionConfig, fuseMs: { min: 9000, max: 9001 } };

    const launch = pickLaunch(seeds(), config);

    expect(launch.fuseMs).toBeGreaterThanOrEqual(9000);
    expect(launch.fuseMs).toBeLessThanOrEqual(9001);
  });

  it("gives the same angle for the same key seed, whatever the press seed", () => {
    const config = {
      ...defaultActionConfig,
      launchAngle: { min: -60, max: 60 },
    };

    const a = pickLaunch(seeds({ key: 1, press: 100 }), config);
    const b = pickLaunch(seeds({ key: 1, press: 200 }), config);

    // Speed (from the press seed) is free to differ, so compare direction,
    // not the full vector — that's what "same angle" actually means here.
    expect(Math.atan2(a.velocity.x, a.velocity.y)).toBeCloseTo(
      Math.atan2(b.velocity.x, b.velocity.y),
    );
  });

  it("varies speed for a different press seed, same key seed", () => {
    const config = {
      ...defaultActionConfig,
      launchSpeed: { min: 10, max: 1000 },
    };

    const a = pickLaunch(seeds({ key: 1, press: 100 }), config);
    const b = pickLaunch(seeds({ key: 1, press: 200 }), config);

    expect(magnitude(a.velocity)).not.toBe(magnitude(b.velocity));
  });

  it("points straight up for an angle of 0", () => {
    const config = { ...defaultActionConfig, launchAngle: { min: 0, max: 0 } };

    const launch = pickLaunch(seeds(), config);

    expect(launch.velocity.x).toBeCloseTo(0);
    expect(launch.velocity.y).toBeGreaterThan(0);
  });

  it("always has a z of 0", () => {
    const launch = pickLaunch(seeds(), defaultActionConfig);

    expect(launch.velocity.z).toBe(0);
  });
});

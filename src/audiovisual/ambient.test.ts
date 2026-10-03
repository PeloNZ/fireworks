import { describe, expect, it } from "vitest";
import { createAmbient } from "./ambient.ts";
import { defaultAudioVisualConfig } from "./config.ts";

// docs/11_ambient_movers.md: rare, random movers behind the fireworks. The
// spawner takes `random` as a plain function, so each test scripts the
// dice. Nothing here reads a clock: `step` receives the elapsed time.

// Hands out the scripted values in order. After the script ends it returns
// 0.99, which is above every chance these tests build, so no later step
// spawns.
function scripted(values: readonly number[]): () => number {
  let next = 0;
  return () => {
    const value = values[next] ?? 0.99;
    next += 1;
    return value;
  };
}

describe("createAmbient", () => {
  // Cycle 5. The comparison is strict (`roll < chance`), so a roll of 0
  // does not spawn when the chance is 0. A `<=` would spawn on every step.
  it("never spawns at rate 0, whatever the roll", () => {
    const ambient = createAmbient({
      config: { ...defaultAudioVisualConfig.ambient, ratePerSecond: 0 },
      random: () => 0,
    });

    expect(ambient.step(10_000)).toEqual([]);
  });

  // Cycle 6. The config states a rate per second, so the chance for one
  // step depends on the elapsed time and not on the frame rate. Worked by
  // hand for a rate of 1 per second:
  //   1000 ms: 1 - e^-1   = 0.6321, so a roll of 0.63 spawns and 0.64 does not.
  //    500 ms: 1 - e^-0.5 = 0.3935, so a roll of 0.39 spawns and 0.40 does not.
  it("turns the rate per second into a chance for the elapsed time", () => {
    const config = { ...defaultAudioVisualConfig.ambient, ratePerSecond: 1 };
    const spawnsAt = (roll: number, elapsedMs: number): number =>
      createAmbient({ config, random: () => roll }).step(elapsedMs).length;

    expect(spawnsAt(0.63, 1000)).toBe(1);
    expect(spawnsAt(0.64, 1000)).toBe(0);
    expect(spawnsAt(0.39, 500)).toBe(1);
    expect(spawnsAt(0.4, 500)).toBe(0);
  });

  // Cycle 7. The draws come in a fixed order: spawn roll, kind, then x, y,
  // direction, speed and time to live. Every roll is different, so swapping any two draws
  // changes the result. Worked by hand for this config:
  //   x 0.25 in [-20, 20]  -> -10        y 0.5 in [60, 100]  -> 80
  //   speed 0.75 in [10, 30] -> 25       vy = -0.25 * 25     -> -6.25
  //   a direction roll under 0.5 moves right, so vx = +25; else vx = -25.
  // After 500 ms the star is 12.5 along x and 3.125 down from (-10, 80).
  const star = {
    x: { min: -20, max: 20 },
    y: { min: 60, max: 100 },
    speed: { min: 10, max: 30 },
    descent: 0.25,
    ttlMs: { min: 1000, max: 2000 },
    brightness: 0.8,
  };

  function starPositionAfter(directionRoll: number, laterMs: number) {
    const ambient = createAmbient({
      config: {
        ...defaultAudioVisualConfig.ambient,
        ratePerSecond: 1,
        shootingStar: star,
      },
      random: scripted([0.5, 0.3, 0.25, 0.5, directionRoll, 0.75, 0.6]),
    });
    ambient.step(1000);
    return ambient.step(laterMs).map((mover) => mover.position);
  }

  it("moves a shooting star from its drawn start along its drawn velocity", () => {
    expect(starPositionAfter(0.2, 500)).toEqual([{ x: 2.5, y: 76.875, z: 0 }]);
    expect(starPositionAfter(0.7, 500)).toEqual([
      { x: -22.5, y: 76.875, z: 0 },
    ]);
  });

  // Cycle 8. The time to live is the last draw: 0.6 in [1000, 2000] is 1600
  // ms. The star starts at brightness 0.8 and falls in a straight line to
  // 0, so at 800 ms, half of its life, it is 0.8 * (1 - 0.5) = 0.4. It is
  // still there at 1599 ms and gone at 1600 ms.
  it("fades a shooting star over its time to live, then removes it", () => {
    const ambient = createAmbient({
      config: {
        ...defaultAudioVisualConfig.ambient,
        ratePerSecond: 1,
        shootingStar: star,
      },
      random: scripted([0.5, 0.3, 0.25, 0.5, 0.2, 0.75, 0.6]),
    });
    const brightnessAfter = (elapsedMs: number): number[] =>
      ambient.step(elapsedMs).map((mover) => mover.brightness);

    expect(brightnessAfter(1000)).toEqual([0.8]);
    expect(brightnessAfter(800)[0]).toBeCloseTo(0.4, 10);
    expect(brightnessAfter(799)).toHaveLength(1);
    expect(brightnessAfter(1)).toEqual([]);
  });
});

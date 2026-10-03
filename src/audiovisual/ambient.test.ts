import { describe, expect, it } from "vitest";
import { createAmbient } from "./ambient.ts";
import { defaultAudioVisualConfig } from "./config.ts";

// docs/11_ambient_movers.md: rare, random movers behind the fireworks. The
// spawner takes `random` as a plain function, so each test scripts the
// dice. Nothing here reads a clock: `step` receives the elapsed time.

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
});

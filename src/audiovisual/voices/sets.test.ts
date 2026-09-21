import { describe, expect, it } from "vitest";
import { soundSets } from "./sets.ts";
import { planToneVoices } from "./tones.ts";
import { planSillyVoices } from "./silly.ts";

// Cycle 15 (docs/08_sound_effects.md): the registry ?sound= looks up.

describe("soundSets", () => {
  it("registers tones and silly, each its own planner", () => {
    expect(soundSets["tones"]).toBe(planToneVoices);
    expect(soundSets["silly"]).toBe(planSillyVoices);
    expect(Object.keys(soundSets).sort()).toEqual(["silly", "tones"]);
  });
});

import { describe, expect, it } from "vitest";
import { defaultSettings } from "../config.ts";
import { loadSettings, mergeOverrides } from "./overrides.ts";

// Cycle 2 (docs/13_settings_overrides.md): a saved value replaces its default.
// The defaults here are small made-up objects with unusual numbers, so a
// hard-coded answer cannot pass.
describe("mergeOverrides: a saved value replaces its default", () => {
  it("replaces a number and keeps the rest", () => {
    const defaults = { drag: 0.3, stepMs: 8 };

    expect(mergeOverrides(defaults, { drag: 0.77 })).toEqual({
      drag: 0.77,
      stepMs: 8,
    });
  });

  it("replaces one nested number and keeps its siblings", () => {
    const defaults = {
      world: { gravity: { x: 0, y: -18, z: 0 }, drag: 0.3 },
      sound: "tones",
    };

    expect(
      mergeOverrides(defaults, { world: { gravity: { y: -4.5 } } }),
    ).toEqual({
      world: { gravity: { x: 0, y: -4.5, z: 0 }, drag: 0.3 },
      sound: "tones",
    });
  });
});

// Cycle 3: a saved value must have the type of its default. Storage can hold
// anything, so a value of the wrong type is ignored and the default stays.
describe("mergeOverrides: a value of the wrong type keeps the default", () => {
  it.each([
    ["a string", "0.77"],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["null", null],
    ["a boolean", true],
    ["an object", { value: 0.77 }],
  ])("keeps a number when the saved value is %s", (_name, saved) => {
    expect(mergeOverrides({ drag: 0.3 }, { drag: saved })).toEqual({
      drag: 0.3,
    });
  });

  it("drops a key that has no default", () => {
    expect(mergeOverrides({ drag: 0.3 }, { drag: 0.5, extra: 1 })).toEqual({
      drag: 0.5,
    });
  });

  it("drops a __proto__ key from saved JSON, so the prototype stays", () => {
    // JSON.parse makes `__proto__` an own key, unlike an object literal.
    const saved: unknown = JSON.parse(
      '{"__proto__":{"polluted":1},"drag":0.5}',
    );

    const merged = mergeOverrides({ drag: 0.3 }, saved);

    expect(merged).toEqual({ drag: 0.5 });
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect("polluted" in merged).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "x"],
    ["a number", 5],
    ["a list", [1]],
  ])("gives the defaults when the whole saved value is %s", (_name, saved) => {
    const defaults = { world: { drag: 0.3 }, stepMs: 8 };

    expect(mergeOverrides(defaults, saved)).toEqual(defaults);
  });

  it("keeps a nested object whose saved value is not an object", () => {
    const defaults = { world: { drag: 0.3 }, stepMs: 8 };

    expect(mergeOverrides(defaults, { world: null, stepMs: 9 })).toEqual({
      world: { drag: 0.3 },
      stepMs: 9,
    });
  });

  it("replaces a string with a string, and keeps it for any other type", () => {
    expect(mergeOverrides({ sound: "tones" }, { sound: "silly" })).toEqual({
      sound: "silly",
    });
    expect(mergeOverrides({ sound: "tones" }, { sound: 5 })).toEqual({
      sound: "tones",
    });
  });

  it("keeps a list as it is, because nothing checks its items", () => {
    expect(
      mergeOverrides({ timbres: ["soft", "sharp"] }, { timbres: ["loud"] }),
    ).toEqual({ timbres: ["soft", "sharp"] });
  });
});

// Cycle 4: `loadSettings` reads the saved JSON from a store and merges it
// over the defaults. The store is a plain object with the one method used.
describe("loadSettings", () => {
  const key = "fireworks.settings";

  it("lays the saved settings over the defaults", () => {
    const store = {
      getItem: (name: string) =>
        name === key
          ? JSON.stringify({
              renderer: "neon",
              world: { drag: 0.77, gravity: { y: -4.5 } },
            })
          : null,
    };

    const settings = loadSettings(store, defaultSettings);

    expect(settings.renderer).toBe("neon");
    expect(settings.sound).toBe("tones");
    expect(settings.world).toEqual({
      gravity: { x: 0, y: -4.5, z: 0 },
      wind: { x: 1.5, y: 0, z: 0 },
      drag: 0.77,
      stepMs: 1000 / 120,
    });
    expect(settings.action).toEqual(defaultSettings.action);
  });

  it("gives the defaults when nothing is saved", () => {
    const store = { getItem: () => null };

    expect(loadSettings(store, defaultSettings)).toEqual(defaultSettings);
  });

  it("gives the defaults when the saved text is not JSON", () => {
    const store = { getItem: () => "{not json" };

    expect(loadSettings(store, defaultSettings)).toEqual(defaultSettings);
  });

  it("gives the defaults when the store throws, as a blocked one does", () => {
    const store = {
      getItem: (): string => {
        throw new Error("The operation is insecure.");
      },
    };

    expect(loadSettings(store, defaultSettings)).toEqual(defaultSettings);
  });
});

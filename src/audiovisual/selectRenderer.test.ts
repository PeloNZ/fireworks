import { describe, expect, it } from "vitest";
import { selectRenderer } from "./selectRenderer.ts";

// Cycle 11 (docs/07_emoji_renderer.md): the lookup rule behind
// `?renderer=<name>`. An unusual two-entry table, so a hardcoded "ascii"
// somewhere cannot pass.

const renderers = { a: 1, b: 2 };

describe("selectRenderer", () => {
  it("returns the requested entry when its name is known", () => {
    expect(selectRenderer("b", renderers, "a")).toEqual({
      name: "b",
      create: 2,
    });
  });

  it("falls back — factory and name together — for an unknown name", () => {
    // The name has to fall back with the factory, not just the factory:
    // the name doubles as the <pre>'s CSS class in main.ts, so returning
    // the requested name here would style the page for a renderer that
    // never actually ran.
    expect(selectRenderer("zzz", renderers, "a")).toEqual({
      name: "a",
      create: 1,
    });
  });

  it("falls back the same way when nothing was requested at all", () => {
    expect(selectRenderer(null, renderers, "a")).toEqual({
      name: "a",
      create: 1,
    });
  });

  it("throws when the fallback name itself is missing from the table", () => {
    expect(() => selectRenderer(null, renderers, "missing")).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { choicesFor } from "./settingsMenu.ts";

// Cycle 1 (docs/10_settings_ui.md): choicesFor turns a list of names and the
// one that runs into the radio list the menu shows. The names here are not
// real renderer names, and the checked one sits in the middle, so a fixed
// list or a "first is checked" shortcut both fail.

describe("choicesFor", () => {
  it("checks only the selected name and keeps the order", () => {
    expect(choicesFor(["zeta", "alpha", "mid"], "alpha")).toEqual([
      { value: "zeta", checked: false },
      { value: "alpha", checked: true },
      { value: "mid", checked: false },
    ]);
  });
});

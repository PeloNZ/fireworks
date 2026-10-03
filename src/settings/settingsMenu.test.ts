import { describe, expect, it, vi } from "vitest";
import { attachSettingsMenu, choicesFor } from "./settingsMenu.ts";
import type { MenuKeyEvent } from "./settingsMenu.ts";

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

// Cycles 2-5: attachSettingsMenu reacts to Esc. Plain fake ports, shaped
// like the slice of the DOM it uses, stand in for a real dialog and window.

function setup(options: { readonly open: boolean }) {
  const listeners: {
    keydown?: (event: MenuKeyEvent) => void;
    close?: () => void;
  } = {};
  const dialog = {
    open: options.open,
    showModal: vi.fn(),
    addEventListener: (_type: "close", listener: () => void) => {
      listeners.close = listener;
    },
  };
  const keyTarget = {
    addEventListener: (
      _type: "keydown",
      listener: (event: MenuKeyEvent) => void,
    ) => {
      listeners.keydown = listener;
    },
  };
  const control = { start: vi.fn(), stop: vi.fn() };
  attachSettingsMenu({ dialog, keyTarget, control });

  function press(code: string) {
    // A missing listener must fail the test, not skip the call.
    if (listeners.keydown === undefined) {
      throw new Error("no keydown listener registered");
    }
    const event = { code, preventDefault: vi.fn() };
    listeners.keydown(event);
    return event;
  }
  return { dialog, control, press, listeners };
}

describe("attachSettingsMenu", () => {
  it("does nothing when the key is not Escape", () => {
    const { dialog, control, press } = setup({ open: false });

    const event = press("KeyA");

    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(control.stop).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("opens the dialog, stops firework input and cancels the key on Escape when the dialog is closed", () => {
    const { dialog, control, press } = setup({ open: false });

    const event = press("Escape");

    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(control.stop).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import { createAsciiRenderer } from "./ascii.ts";
import { rasteriseFrame } from "./asciiGrid.ts";
import { overlayGrid, rasteriseBackdrop } from "./asciiBackdrop.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { Backdrop, Frame, Mover } from "../types.ts";

// Cycle 5 (docs/05_audio_visual_layer.md): the adapter itself is one
// assignment — target.textContent = rasteriseFrame(frame, config.ascii) —
// now that cycle 4 did the actual work. Tested against a fake target, a
// plain object shaped like the slice of a DOM element this needs, the
// same "port" pattern createKeyboardAdapter's KeyEventLike uses.

function createTarget(): {
  readonly target: { textContent: string };
  readonly writes: string[];
} {
  const writes: string[] = [];
  const target = {
    get textContent(): string {
      return writes.at(-1) ?? "";
    },
    set textContent(value: string) {
      writes.push(value);
    },
  };
  return { target, writes };
}

function shellFrame(): Frame {
  return {
    sprites: [
      {
        kind: "shell",
        position: { x: 0, y: 50, z: 0 },
        size: 1,
        color: { r: 1, g: 1, b: 1 },
        brightness: 1,
      },
    ],
    ambient: [],
  };
}

describe("createAsciiRenderer", () => {
  it("writes rasteriseFrame's output to the target exactly once per call", () => {
    const { target, writes } = createTarget();
    const renderer = createAsciiRenderer({
      target,
      config: defaultAudioVisualConfig,
      backdrop: null,
    });
    const frame = shellFrame();

    renderer(frame);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe(
      rasteriseFrame(frame, defaultAudioVisualConfig.ascii),
    );
  });

  // Cycle 12 (docs/06_world_backdrop.md): a backdrop composites underneath
  // the frame. It is rasterised once, at construction — `base` is computed
  // outside the returned closure, which is a code shape a reviewer checks
  // rather than a behaviour a test asserts. Inventing an injection seam
  // purely to count calls would add a concept for a test's sake.

  it("composites the frame over the backdrop when one is given", () => {
    // Unusual columns and rows, so what passes is the composition rather
    // than a coincidence at the default grid size.
    const config = {
      ...defaultAudioVisualConfig,
      ascii: { ...defaultAudioVisualConfig.ascii, columns: 7, rows: 3 },
    };
    const backdrop: Backdrop = {
      sky: { horizon: 0.2, zenith: 0.05 },
      bodies: [{ kind: "moon", position: { x: -30, y: 80, z: 0 } }],
      ground: [
        { x: -50, height: 8 },
        { x: 50, height: 20 },
      ],
    };
    const { target, writes } = createTarget();
    const renderer = createAsciiRenderer({ target, config, backdrop });
    const frame = shellFrame();

    renderer(frame);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe(
      overlayGrid(
        rasteriseBackdrop(backdrop, config),
        rasteriseFrame(frame, config.ascii),
      ),
    );
  });

  // Cycle 4 (docs/11_ambient_movers.md): movers draw between the backdrop
  // and the fireworks. The expected grids are written out by hand, not built
  // with the functions under test, so a wrong layer order cannot pass. A 5x3
  // grid over a flat sky of brightness 0.2 is ":" in every cell, because
  // ramp index round(0.2 * 9) = 2. A mover at (0, 50) is row 1, column 2.
  // Brightness 0.6 is ramp index round(5.4) = 5, which is "+".

  describe("with ambient movers", () => {
    const config = {
      ...defaultAudioVisualConfig,
      ascii: { ...defaultAudioVisualConfig.ascii, columns: 5, rows: 3 },
    };
    const flatSky: Backdrop = {
      sky: { horizon: 0.2, zenith: 0.2 },
      bodies: [],
      ground: [
        { x: -50, height: 0 },
        { x: 50, height: 0 },
      ],
    };
    const mover: Mover = {
      kind: "satellite",
      position: { x: 0, y: 50, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      brightness: 0.6,
    };
    const firework = (x: number, y: number): Frame["sprites"][number] => ({
      kind: "shell",
      position: { x, y, z: 0 },
      size: 1,
      color: { r: 1, g: 1, b: 1 },
      brightness: 1,
    });

    function draw(frame: Frame, backdrop: Backdrop | null): string | undefined {
      const { target, writes } = createTarget();
      createAsciiRenderer({ target, config, backdrop })(frame);
      return writes[0];
    }

    it("shows a mover over the sky, and the sky everywhere else", () => {
      const frame: Frame = { sprites: [], ambient: [mover] };

      expect(draw(frame, flatSky)).toBe(":::::\n::+::\n:::::");
    });

    it("shows a firework over a mover in the same cell", () => {
      const frame: Frame = {
        sprites: [firework(0, 50), firework(-50, 90)],
        ambient: [mover],
      };

      expect(draw(frame, flatSky)).toBe("@::::\n::@::\n:::::");
    });

    it("shows a mover when there is no backdrop", () => {
      const frame: Frame = { sprites: [], ambient: [mover] };

      expect(draw(frame, null)).toBe("     \n  +  \n     ");
    });
  });
});

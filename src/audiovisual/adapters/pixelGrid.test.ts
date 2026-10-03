import { describe, expect, it } from "vitest";
import {
  discCells,
  indexFor,
  paintFrame,
  pixelCentreX,
  sparkIndex,
  toPixel,
  worldHalfWidth,
} from "./pixelGrid.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Frame, Mover, Rgb, Sprite } from "../types.ts";

// Cycle 3 (docs/09_8bit_renderer.md): the pixel renderer is the emoji
// renderer with a palette index where the glyph was -- sparkIndex is
// sparkGlyph's exact structure, over AudioVisualConfig["pixel"] instead of
// ["emoji"]. An unusual two-entry hue table and a saturation floor driven
// away from the 0.15 default, so neither can pass by coincidence.

const pixel: AudioVisualConfig["pixel"] = {
  ...defaultAudioVisualConfig.pixel,
  sparkHues: [
    { hue: 10, index: 3 },
    { hue: 200, index: 12 },
  ],
  desaturated: 6,
  saturationFloor: 0.5,
};

// Full-saturation colours at a chosen hue and saturation, via a small
// HSV-to-RGB conversion -- the same helper emojiGrid.test.ts uses, so each
// test names the hue and saturation it means rather than a hand-picked
// triple.
function atHue(hue: number, saturation = 1): Rgb {
  const c = saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const m = 1 - saturation;
  return { r: r + m, g: g + m, b: b + m };
}

describe("sparkIndex", () => {
  it("picks the nearest hue's index, wrapping the short way round", () => {
    // 350 is 20 degrees from 10 the short way, 340 the long way.
    expect(sparkIndex(atHue(350), pixel)).toBe(3);
  });

  it("returns the desaturated index below the saturation floor", () => {
    // Driven at floor 0.5, never the 0.15 default -- a hardcoded floor
    // would pass a 0.3-saturation colour through to a hue index instead.
    expect(sparkIndex(atHue(10, 0.3), pixel)).toBe(6);
  });

  it("picks by hue once saturation clears the floor", () => {
    expect(sparkIndex(atHue(10, 0.6), pixel)).toBe(3);
  });
});

// Cycle 4: indexFor dispatches on sprite.kind, mirroring emojiGrid's
// glyphFor exactly. pixel.shell and pixel.trail arrive together with
// sparkIndex's dispatch because noImplicitReturns plus the three-member
// kind union forbid a partial switch.
describe("indexFor", () => {
  function sprite(overrides: Partial<Sprite> = {}): Sprite {
    return {
      kind: "shell",
      position: { x: 0, y: 0, z: 0 },
      size: 1,
      color: atHue(10),
      brightness: 1,
      ...overrides,
    };
  }

  it("returns the shell index for a shell, regardless of its colour", () => {
    const config = { ...pixel, shell: 2 };

    expect(indexFor(sprite({ kind: "shell", color: atHue(200) }), config)).toBe(
      2,
    );
  });

  it("returns sparkIndex's answer for a spark", () => {
    expect(indexFor(sprite({ kind: "spark", color: atHue(200) }), pixel)).toBe(
      12,
    );
  });

  it("picks a trail's index from brightness alone, ignoring its colour", () => {
    const config = { ...pixel, trail: [4, 5, 6] };

    expect(
      indexFor(
        sprite({ kind: "trail", color: atHue(200), brightness: 0.5 }),
        config,
      ),
    ).toBe(5);
  });
});

// Cycle 5: the grid fills the viewport, so its width is derived from its
// shape rather than fixed at world x in [-50, 50) the way toCell's grid
// is. columns !== rows here, so a copy of columnCentreX's fixed ±50
// assumption fails.
const wideGrid = { columns: 10, rows: 8 };

describe("worldHalfWidth", () => {
  it("scales with columns/rows rather than assuming a square world", () => {
    expect(worldHalfWidth(wideGrid)).toBe(62.5);
  });
});

describe("pixelCentreX", () => {
  it("centres the leftmost and rightmost columns inside worldHalfWidth", () => {
    expect(pixelCentreX(0, wideGrid)).toBe(-56.25);
    expect(pixelCentreX(9, wideGrid)).toBe(56.25);
  });

  it("keeps pixels square: width and height agree for two different grids", () => {
    // A pixel's width is 2*worldHalfWidth/columns; its height is always
    // 100/rows, since world y in [0,100) maps across every row regardless
    // of shape. Square pixels are a property of the formula, not of a
    // chosen resolution.
    for (const grid of [wideGrid, { columns: 3, rows: 3 }]) {
      const pixelWidth = (2 * worldHalfWidth(grid)) / grid.columns;
      const pixelHeight = 100 / grid.rows;
      expect(pixelWidth).toBeCloseTo(pixelHeight);
    }
  });
});

// Cycle 6: the flat row-major offset a point falls on, or null when
// clipped. columns !== rows in wideGrid rules out confusing
// row*columns+column with column*rows+row.
describe("toPixel", () => {
  it("maps a pixel centre back to that pixel's flat offset", () => {
    // Row 3, column 5's centre: x = pixelCentreX(5, wideGrid), y = the
    // world y whose row (by toCell's own row formula) is 3.
    const x = pixelCentreX(5, wideGrid);
    const y = (100 * (wideGrid.rows - 3 - 0.5)) / wideGrid.rows;

    expect(toPixel(x, y, wideGrid)).toBe(3 * wideGrid.columns + 5);
  });

  it("clips a point beyond worldHalfWidth to null", () => {
    expect(toPixel(100, 50, wideGrid)).toBeNull();
    expect(toPixel(-100, 50, wideGrid)).toBeNull();
  });

  it("clips y at the top and bottom of the half-open box", () => {
    expect(toPixel(0, 100, wideGrid)).toBeNull();
    expect(toPixel(0, -1, wideGrid)).toBeNull();
  });
});

// Cycle 7: the disc a sprite's radius actually covers. wideGrid's pixel
// centres sit 12.5 world units apart on both axes; centre {x:0,y:50} sits
// between four of them and radius 20 is chosen so the boundary falls
// clear of every pixel centre in the grid (nearest ring at ~19.76, next
// at ~26.52 -- no rounding tie). The expected set is a genuine 2-4-4-2
// diamond, not an axis-aligned box, so a bounding-box implementation
// fails this.
describe("discCells", () => {
  it("paints a disc, not a box, around the centre", () => {
    const offsets = discCells({ x: 0, y: 50 }, 20, wideGrid);

    expect(Array.from(offsets).sort((a, b) => a - b)).toEqual([
      24, 25, 33, 34, 35, 36, 43, 44, 45, 46, 54, 55,
    ]);
  });

  it("still paints one pixel when the radius covers no pixel centre", () => {
    // This is the cycle the whole renderer depends on. wideGrid's nearest
    // pixel centre to {x:0,y:50} is ~8.84 world units away, so a pure
    // distance test at radius 0.1 finds nothing -- and at 160 rows a
    // spark's real radius is under one pixel, so without this fallback
    // every spark in the game would be invisible.
    const offsets = discCells({ x: 0, y: 50 }, 0.1, wideGrid);

    expect(Array.from(offsets)).toEqual([toPixel(0, 50, wideGrid)]);
  });

  it("slides off the edge instead of popping out, with no wraparound", () => {
    // Centre x=-70 is outside worldHalfWidth (62.5), so an implementation
    // that clips on the centre -- as both existing renderers do -- would
    // return []. Only column 0's centre (-56.25) is close enough for any
    // radius-20 disc to reach; rows 3 and 4 are the only ones near
    // enough on y. Nothing here is a column-9 offset, which is the
    // no-wraparound check.
    const offsets = discCells({ x: -70, y: 50 }, 20, wideGrid);

    expect(Array.from(offsets)).toEqual([30, 40]);
  });

  it("returns nothing for a centre and radius that never reach the grid", () => {
    // Proves the sub-pixel fallback does not clamp an off-grid centre
    // onto the nearest column, which would smear a departing sprite
    // along the border.
    const offsets = discCells({ x: -80, y: 50 }, 5, wideGrid);

    expect(Array.from(offsets)).toEqual([]);
  });
});

// Cycle 10: the whole grid, filled with pixel.blank and one sprite
// painted -- the pixel counterpart of rasteriseFrame/rasteriseEmojiFrame.
// blank: 7, never 0, so a hardcoded zero-fill can't pass.
describe("paintFrame", () => {
  it("fills the buffer with blank, painting one sprite's disc over it", () => {
    const pixel: AudioVisualConfig["pixel"] = {
      ...defaultAudioVisualConfig.pixel,
      sparkHues: [{ hue: 10, index: 3 }],
      columns: wideGrid.columns,
      rows: wideGrid.rows,
      blank: 7,
    };
    const frame: Frame = {
      sprites: [
        {
          kind: "spark",
          position: { x: 0, y: 50, z: 0 },
          size: 0.1,
          color: atHue(10),
          brightness: 1,
        },
      ],
      ambient: [],
    };

    const buffer = paintFrame(frame, pixel);

    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBe(80);
    const expected = new Array<number>(80).fill(7);
    const spark = toPixel(0, 50, wideGrid);
    if (spark !== null) {
      expected[spark] = 3;
    }
    expect(Array.from(buffer)).toEqual(expected);
  });
});

// Cycle 11: which sprite wins a pixel two discs both cover. Brightest
// wins; on a tie the earlier sprite in frame.sprites keeps it --
// byte-identical to contestCells's own rule, and reversed by any naive
// painter's-algorithm implementation where the later sprite simply wins.
describe("paintFrame -- the brightness contest", () => {
  const contestPixel: AudioVisualConfig["pixel"] = {
    ...defaultAudioVisualConfig.pixel,
    sparkHues: [
      { hue: 10, index: 3 },
      { hue: 200, index: 12 },
    ],
    trail: [4, 5, 6],
    columns: wideGrid.columns,
    rows: wideGrid.rows,
    blank: 7,
  };
  const offset = toPixel(0, 50, wideGrid);
  if (offset === null) {
    throw new Error("unreachable: {x:0,y:50} is inside wideGrid");
  }

  function spark(hue: number, brightness: number): Sprite {
    return {
      kind: "spark",
      position: { x: 0, y: 50, z: 0 },
      size: 0.1,
      color: atHue(hue),
      brightness,
    };
  }

  it("the brighter sprite wins, whichever order they're drawn in", () => {
    const frame: Frame = {
      sprites: [spark(10, 0.9), spark(200, 0.2)],
      ambient: [],
    };

    expect(paintFrame(frame, contestPixel)[offset]).toBe(3);
  });

  it("on a tied brightness, the earlier sprite keeps the pixel", () => {
    const frame: Frame = {
      sprites: [spark(10, 0.5), spark(200, 0.5)],
      ambient: [],
    };

    expect(paintFrame(frame, contestPixel)[offset]).toBe(3);
  });

  it("a lone sprite at brightness 0 still paints, rather than staying blank", () => {
    // The trap inside the fix: a fully decayed trail has brightness 0
    // (frame.ts), so the brightness buffer must start at -1, not 0, or a
    // zero-filled buffer swallows this sprite as if nothing were there.
    const frame: Frame = {
      sprites: [
        {
          kind: "trail",
          position: { x: 0, y: 50, z: 0 },
          size: 0.1,
          color: atHue(10),
          brightness: 0,
        },
      ],
      ambient: [],
    };

    expect(paintFrame(frame, contestPixel)[offset]).toBe(4);
  });
});

// Cycle 12: a sprite's own radius is scaled by its brightness before it's
// painted. frame.ts gives a shell's trail points size: config.shellSize,
// identical to the shell itself -- without this, a trail is a chain of
// full-size discs the width of the shell it follows.
describe("paintFrame -- radius scales with brightness", () => {
  function frameAt(brightness: number): Frame {
    return {
      sprites: [
        {
          kind: "spark",
          position: { x: 0, y: 50, z: 0 },
          size: 20,
          color: atHue(10),
          brightness,
        },
      ],
      ambient: [],
    };
  }

  function litOffsets(buffer: Uint8Array, blank: number): readonly number[] {
    const lit: number[] = [];
    buffer.forEach((value, offset) => {
      if (value !== blank) {
        lit.push(offset);
      }
    });
    return lit;
  }

  it("paints a smaller disc at a dimmer, never-default brightness", () => {
    const pixel: AudioVisualConfig["pixel"] = {
      ...defaultAudioVisualConfig.pixel,
      sparkHues: [{ hue: 10, index: 3 }],
      columns: wideGrid.columns,
      rows: wideGrid.rows,
      blank: 7,
    };

    const bright = litOffsets(paintFrame(frameAt(1), pixel), pixel.blank);
    const dim = litOffsets(paintFrame(frameAt(0.25), pixel), pixel.blank);

    expect(dim.length).toBeLessThan(bright.length);
    expect(dim).toEqual(
      Array.from(discCells({ x: 0, y: 50 }, 20 * 0.25, wideGrid)),
    );
  });
});

// Cycle 22 (docs/11_ambient_movers.md): a mover is one pixel, its index
// picked from `moverRamp` by brightness. Worked by hand on the 10x8 grid: a
// pixel is 12.5 world units wide and tall, and world x spans -62.5..62.5.
//   column c has its centre at x = -62.5 + 12.5 * (c + 0.5); row r has its
//   centre at y = 100 * (8 - r - 0.5) / 8.
//   (6.25, 56.25) is column 5, row 3: offset 35.
//   (-31.25, 81.25) is column 2, row 1: offset 12.
// blank is 7, never 0, and the ramp [7, 2, 3, 4] has four levels, so
// brightness 1 is index round(3) = 3 -> 4, 0.67 is round(2.01) = 2 -> 3, and 0
// is index 0 -> 7, which is blank.
describe("paintFrame -- ambient movers", () => {
  const moverPixel: AudioVisualConfig["pixel"] = {
    ...defaultAudioVisualConfig.pixel,
    moverRamp: [7, 2, 3, 4],
    moverTailMs: { shootingStar: 0, satellite: 0 },
    sparkHues: [{ hue: 10, index: 3 }],
    trail: [7, 5, 6],
    columns: wideGrid.columns,
    rows: wideGrid.rows,
    blank: 7,
  };

  function mover(overrides: Partial<Mover> = {}): Mover {
    return {
      kind: "satellite",
      position: { x: 6.25, y: 56.25, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      brightness: 1,
      ...overrides,
    };
  }

  function paint(
    movers: readonly Mover[],
    sprites: readonly Sprite[] = [],
    config: AudioVisualConfig["pixel"] = moverPixel,
  ): number[] {
    return Array.from(paintFrame({ sprites, ambient: movers }, config));
  }

  // A sprite on the pixel at offset 35, the same pixel as `mover()`.
  function sprite(overrides: Partial<Sprite>): Sprite {
    return {
      kind: "spark",
      position: { x: 6.25, y: 56.25, z: 0 },
      size: 0.1,
      color: atHue(10),
      brightness: 1,
      ...overrides,
    };
  }

  function blankWith(entries: Record<number, number>): number[] {
    const expected = new Array<number>(80).fill(7);
    for (const [offset, index] of Object.entries(entries)) {
      expected[Number(offset)] = index;
    }
    return expected;
  }

  it("paints one pixel for each mover, with the ramp index for its brightness", () => {
    const movers = [
      mover({ position: { x: 6.25, y: 56.25, z: 0 }, brightness: 1 }),
      mover({ position: { x: -31.25, y: 81.25, z: 0 }, brightness: 0.67 }),
    ];

    expect(paint(movers)).toEqual(blankWith({ 35: 4, 12: 3 }));
  });

  it("paints nothing for a mover outside the grid", () => {
    const movers = [
      mover({ position: { x: 70, y: 56.25, z: 0 } }),
      mover({ position: { x: 6.25, y: 100, z: 0 } }),
    ];

    expect(paint(movers)).toEqual(blankWith({}));
  });

  it("gives a shared pixel to the later mover, not the brighter one", () => {
    const movers = [mover({ brightness: 1 }), mover({ brightness: 0.67 })];

    expect(paint(movers)).toEqual(blankWith({ 35: 3 }));
  });

  // The same house rule as trail[0] === blank: a fully faded mover must vanish.
  it("starts the default mover ramp on blank", () => {
    const { moverRamp, blank } = defaultAudioVisualConfig.pixel;

    expect(moverRamp[0]).toBe(blank);
  });

  it("never paints blank, so a mover too dim to show leaves the pixel to the one before it", () => {
    const movers = [mover({ brightness: 1 }), mover({ brightness: 0 })];

    expect(paint(movers)).toEqual(blankWith({ 35: 4 }));
  });

  // Cycle 23. A firework always covers a mover (docs/11 decision 4).
  it("lets a firework cover a mover", () => {
    expect(paint([mover()], [sprite({ brightness: 1 })])).toEqual(
      blankWith({ 35: 3 }),
    );
  });

  // A trail at brightness 0 draws index trail[0], which is blank. It still
  // paints its centre pixel, so it must not erase the mover under it.
  it("keeps the mover where a dead trail sits", () => {
    const deadTrail = sprite({ kind: "trail", brightness: 0 });

    expect(paint([mover()], [deadTrail])).toEqual(blankWith({ 35: 4 }));
  });

  // The firework contest is unchanged: a dead trail that paints a pixel first
  // keeps it against a dimmer spark, so the pixel stays blank. A frame with
  // no mover shows this.
  it("keeps a blank pixel blank when a dimmer spark follows a dead trail", () => {
    const sprites = [
      sprite({ kind: "trail", size: 1, brightness: 0.1 }),
      sprite({ brightness: 0.05 }),
    ];

    expect(paint([], sprites)).toEqual(blankWith({}));
  });

  // Cycle 24. A tail runs behind the head, against the velocity, one sample
  // for each pixel step (100 / 8 = 12.5 world units). Brightness falls in a
  // straight line from the head's to 0 at the far end of the tail. The ramp
  // is [7, 2, 3, 4], so a sample at brightness b gets index round(3b):
  // blank (7) at 0, 2 at 1, 3 at 2 and 4 at 3. Samples that land on blank are
  // not painted.
  describe("the tail", () => {
    const tailed: AudioVisualConfig["pixel"] = {
      ...moverPixel,
      moverTailMs: { shootingStar: 1000, satellite: 0 },
    };

    // Speed 40 for 1000 ms: a tail 40 units long, so floor(40 / 12.5) = 3
    // samples at 12.5, 25 and 37.5 units behind the head. They fall on the
    // centres of columns 4, 3 and 2 of row 3. Brightness there is
    // 1 - 12.5 / 40 = 0.6875 (3 * 0.6875 = 2.06, index 2, so 3),
    // 1 - 25 / 40 = 0.375 (1.125, index 1, so 2) and
    // 1 - 37.5 / 40 = 0.0625 (0.19, index 0, which is blank).
    it("fades along its length, behind the head", () => {
      const star = mover({
        kind: "shootingStar",
        velocity: { x: 40, y: 0, z: 0 },
      });

      expect(paint([star], [], tailed)).toEqual(
        blankWith({ 35: 4, 34: 3, 33: 2 }),
      );
    });

    it("runs against the velocity, so a mover that goes left has its tail on the right", () => {
      const star = mover({
        kind: "shootingStar",
        velocity: { x: -40, y: 0, z: 0 },
      });

      expect(paint([star], [], tailed)).toEqual(
        blankWith({ 35: 4, 36: 3, 37: 2 }),
      );
    });

    // Velocity (30, 40) is speed 50 along (0.6, 0.8). 700 ms makes the tail
    // 35 units: 2 samples, at 12.5 and 25 units. They are 7.5 left and 10
    // down, then 15 left and 20 down, from the head at (6.25, 56.25):
    // (-1.25, 46.25) is column 4, row 4 (offset 44), and (-8.75, 36.25) is
    // column 4, row 5 (offset 54). Brightness is 1 - 12.5 / 35 = 0.643
    // (1.93, index 2, so 3) and 1 - 25 / 35 = 0.286 (0.86, index 1, so 2).
    it("runs along a diagonal velocity", () => {
      const star = mover({
        kind: "shootingStar",
        velocity: { x: 30, y: 40, z: 0 },
      });
      const config = {
        ...moverPixel,
        moverTailMs: { shootingStar: 700, satellite: 0 },
      };

      expect(paint([star], [], config)).toEqual(
        blankWith({ 35: 4, 44: 3, 54: 2 }),
      );
    });

    it("takes its length from the mover's kind: tailMs 0 draws the head only", () => {
      const satellite = mover({
        kind: "satellite",
        velocity: { x: 40, y: 0, z: 0 },
      });

      expect(paint([satellite], [], tailed)).toEqual(blankWith({ 35: 4 }));
    });

    // The head at (11.9, 61.9) is column 5, row 3 (offset 35). So is the first
    // tail sample, at (4.4, 51.9). The head paints last, so it keeps the pixel.
    // The second sample is at (-3.1, 41.9): column 4, row 4 (offset 44).
    it("lets the head win a pixel its own tail shares", () => {
      const star = mover({
        kind: "shootingStar",
        position: { x: 11.9, y: 61.9, z: 0 },
        velocity: { x: 30, y: 40, z: 0 },
      });
      const config = {
        ...moverPixel,
        moverTailMs: { shootingStar: 700, satellite: 0 },
      };

      expect(paint([star], [], config)).toEqual(blankWith({ 35: 4, 44: 2 }));
    });
  });
});

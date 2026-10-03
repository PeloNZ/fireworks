import { describe, expect, it } from "vitest";
import {
  glyphFor,
  overlayEmojiGrid,
  rampGlyph,
  rasteriseEmojiAmbient,
  rasteriseEmojiFrame,
  sparkGlyph,
} from "./emojiGrid.ts";
import { defaultAudioVisualConfig } from "../config.ts";
import type { AudioVisualConfig } from "../config.ts";
import type { Frame, Mover, Rgb, Sprite } from "../types.ts";

// Cycle 3 (docs/07_emoji_renderer.md): the fact ASCII discards — colour —
// becomes a glyph. An unusual two-entry hue table, so the real seven-entry
// default can't pass by accident.

const emoji: AudioVisualConfig["emoji"] = {
  ...defaultAudioVisualConfig.emoji,
  sparkHues: [
    { hue: 10, glyph: "A" },
    { hue: 200, glyph: "B" },
  ],
  desaturated: "?",
  saturationFloor: 0.15,
};

// Full-saturation colours at a chosen hue, built via a small HSV-to-RGB
// so each test names the hue it means rather than a hand-picked triple.
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

describe("sparkGlyph", () => {
  it("picks the nearest hue in the table", () => {
    expect(sparkGlyph(atHue(15), emoji)).toBe("A");
    expect(sparkGlyph(atHue(190), emoji)).toBe("B");
  });

  it("wraps around the wheel: hue 350 is nearer 10 than it is to 200", () => {
    expect(sparkGlyph(atHue(350), emoji)).toBe("A");
  });

  it("returns the desaturated glyph for a colour below the saturation floor", () => {
    expect(sparkGlyph(atHue(10, 0.05), emoji)).toBe("?");
  });

  it("still matches by hue for a colour just above the saturation floor", () => {
    expect(sparkGlyph(atHue(10, 0.2), emoji)).toBe("A");
  });
});

// Cycle 4: rampGlyph mirrors rampChar over an array instead of a string.
// An unusual three-entry list, so brightness 0 returning the first entry
// (the blank, by house rule) can't be confused with an off-by-one that a
// two-entry list would hide.
const glyphs = ["dim", "mid", "bright"];

describe("rampGlyph", () => {
  it("returns the first entry at brightness 0 — the blank, by house rule", () => {
    expect(rampGlyph(0, glyphs)).toBe("dim");
  });

  it("returns the last entry at brightness 1", () => {
    expect(rampGlyph(1, glyphs)).toBe("bright");
  });

  it("rounds to the nearest entry in between", () => {
    expect(rampGlyph(0.5, glyphs)).toBe("mid");
  });

  it("clamps brightness outside 0..1", () => {
    expect(rampGlyph(-5, glyphs)).toBe("dim");
    expect(rampGlyph(5, glyphs)).toBe("bright");
  });
});

describe("glyphFor", () => {
  function sprite(overrides: Partial<Sprite> = {}): Sprite {
    return {
      kind: "shell",
      position: { x: 0, y: 0, z: 0 },
      size: 1,
      color: atHue(10),
      brightness: 1,
      velocity: { x: 0, y: 0, z: 0 },
      ...overrides,
    };
  }

  it("returns the shell glyph for a shell, regardless of its colour", () => {
    const config = { ...emoji, shell: "S" };

    expect(glyphFor(sprite({ kind: "shell", color: atHue(200) }), config)).toBe(
      "S",
    );
  });

  it("returns sparkGlyph's answer for a spark", () => {
    expect(glyphFor(sprite({ kind: "spark", color: atHue(190) }), emoji)).toBe(
      "B",
    );
  });

  it("picks a trail's glyph from brightness alone, ignoring its colour", () => {
    const config = { ...emoji, trail: glyphs };

    expect(
      glyphFor(
        sprite({ kind: "trail", color: atHue(200), brightness: 0 }),
        config,
      ),
    ).toBe("dim");
  });
});

// Cycle 5: the whole grid, as an array of rows of cell strings — never a
// joined string, since an emoji is more than one UTF-16 code unit. A 3x2
// grid with an unusual glyph set, so the real defaults can't pass.
describe("rasteriseEmojiFrame", () => {
  it("flips y and centres x, filling every empty cell with the blank glyph", () => {
    const config: AudioVisualConfig["emoji"] = {
      ...emoji,
      columns: 3,
      rows: 2,
      blank: ".",
      shell: "Q",
      sparkHues: [{ hue: 0, glyph: "R" }],
    };
    const frame: Frame = {
      sprites: [
        {
          kind: "shell",
          position: { x: -50, y: 90, z: 0 },
          size: 1,
          color: { r: 1, g: 1, b: 1 },
          brightness: 1,
          velocity: { x: 0, y: 0, z: 0 },
        },
        {
          kind: "spark",
          position: { x: 40, y: 10, z: 0 },
          size: 1,
          color: atHue(0),
          brightness: 1,
          velocity: { x: 0, y: 0, z: 0 },
        },
      ],
      ambient: [],
    };

    expect(rasteriseEmojiFrame(frame, config)).toEqual([
      ["Q", ".", "."],
      [".", ".", "R"],
    ]);
  });
});

// Cycle 6: compositing the finished foreground grid over the finished
// backdrop grid, the emoji counterpart of overlayGrid. Same rule: the
// foreground shows through unless it is blank.
describe("overlayEmojiGrid", () => {
  it("takes the foreground's glyph where it has one, and the base's where it does not", () => {
    const base = [
      ["a", "b"],
      ["c", "d"],
    ];
    const over = [
      ["X", "-"],
      ["-", "Y"],
    ];

    expect(overlayEmojiGrid(base, over, "-")).toEqual([
      ["X", "b"],
      ["c", "Y"],
    ]);
  });

  it("leaves a cell blank when neither layer draws anything there, and never changes the grid's shape", () => {
    const base = [
      ["-", "-"],
      ["-", "-"],
    ];
    const over = [
      ["-", "-"],
      ["-", "-"],
    ];

    const composited = overlayEmojiGrid(base, over, "-");

    expect(composited).toEqual(base);
    expect(composited).toHaveLength(2);
    expect(composited[0]).toHaveLength(2);
  });
});

// Cycle 17 (docs/11_ambient_movers.md): a mover becomes the glyph for its
// kind. Override glyphs and a one-character blank, so a hardcoded 🌠 or ⬛
// fails. On a 4x2 grid, x = -40 is column floor(10 / 25) = 0 and x = 30 is
// column floor(80 / 25) = 3. y = 75 is row 1 - floor(1.5) = 0 and y = 25 is
// row 1 - floor(0.5) = 1.

describe("rasteriseEmojiAmbient", () => {
  const ambientEmoji: AudioVisualConfig["emoji"] = {
    ...defaultAudioVisualConfig.emoji,
    columns: 4,
    rows: 2,
    blank: ".",
    movers: { shootingStar: "A", satellite: "B" },
  };

  function mover(overrides: Partial<Mover> = {}): Mover {
    return {
      kind: "satellite",
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      brightness: 1,
      ...overrides,
    };
  }

  it("draws the glyph for each mover's kind in its cell, and the blank everywhere else", () => {
    const movers = [
      mover({
        kind: "shootingStar",
        position: { x: -40, y: 75, z: 0 },
        brightness: 0.05,
      }),
      mover({ kind: "satellite", position: { x: 30, y: 25, z: 0 } }),
    ];

    expect(rasteriseEmojiAmbient(movers, ambientEmoji)).toEqual([
      ["A", ".", ".", "."],
      [".", ".", ".", "B"],
    ]);
  });

  it("draws nothing for a mover outside the grid", () => {
    const outside = [mover({ position: { x: 60, y: 50, z: 0 } })];

    expect(rasteriseEmojiAmbient(outside, ambientEmoji)).toEqual([
      [".", ".", ".", "."],
      [".", ".", ".", "."],
    ]);
  });

  // The two house rules of docs/07_emoji_renderer.md, applied to the default
  // mover glyphs: no variation selector (a font may draw it at another
  // width, which shears the grid), and none equal to the blank (a mover
  // would be invisible).
  it("uses default glyphs that have no variation selector and are not the blank", () => {
    const { blank, movers } = defaultAudioVisualConfig.emoji;

    for (const glyph of Object.values(movers)) {
      expect(glyph).not.toContain("\uFE0F");
      expect(glyph).not.toBe(blank);
    }
  });
});

import { describe, expect, it } from "vitest";
import { parseHexColor } from "./color.ts";

// Cycle 1 (docs/05_audio_visual_layer.md): every sprite's colour starts as
// a FireworkSpec's CSS hex string and has to become the 0..1 floats every
// later brightness and blend calculation in this layer works in.

describe("parseHexColor", () => {
  it("parses a 6-digit hex colour into 0..1 floats", () => {
    const result = parseHexColor("#ff3b30");

    expect(result.r).toBe(1);
    expect(result.g).toBeCloseTo(59 / 255);
    expect(result.b).toBeCloseTo(48 / 255);
  });

  it("parses uppercase hex digits the same way as lowercase", () => {
    expect(parseHexColor("#FF3B30")).toEqual(parseHexColor("#ff3b30"));
  });

  it("throws on a malformed string", () => {
    expect(() => parseHexColor("not-a-colour")).toThrow();
  });
});

import { parseHexColor } from "./color.ts";
import { lerpVec3 } from "./interpolate.ts";
import { expandBurst } from "./sparks.ts";
import type { createTrails } from "./trails.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { WorldConfig } from "../action/worldConfig.ts";
import type { Sprite, Frame } from "./types.ts";
import type { Firework } from "../action/types.ts";

// A shell is visible while it's actually moving under its own power or
// ballistically — not while "armed" (not yet launched) and not once a
// burst has started, when the shell itself is gone and only its sparks
// remain (cycle 12).
const SHELL_VISIBLE_PHASES = new Set(["launching", "flying"]);

function firstColor(spec: Firework["spec"]): string {
  const color = spec.colors[0];
  if (color === undefined) {
    // spec.colors is contractually non-empty — buildFireworkSpec always
    // fills it from ActionConfig.paletteSize. noUncheckedIndexedAccess
    // can't see that guarantee, so it types this access as possibly
    // undefined regardless. Same pattern as traits.ts's pickPattern guard.
    throw new Error("FireworkSpec.colors must not be empty");
  }
  return color;
}

/**
 * Builds this frame's display list from Action's current snapshot. Reads
 * only what Action already decided — nothing here derives a new fact.
 * `ambient` is empty: the movers come from `createAmbient`, and the layer
 * fills them in.
 */
export function buildFrame(options: {
  readonly entities: readonly Firework[];
  readonly alpha: number;
  readonly config: AudioVisualConfig;
  readonly worldConfig: WorldConfig;
  readonly trails: ReturnType<typeof createTrails>;
}): Frame {
  const { entities, alpha, config, worldConfig, trails } = options;
  const sprites: Sprite[] = [];

  for (const firework of entities) {
    if (SHELL_VISIBLE_PHASES.has(firework.phase)) {
      sprites.push({
        kind: "shell",
        position: lerpVec3(firework.previousPosition, firework.position, alpha),
        size: config.shellSize,
        color: parseHexColor(firstColor(firework.spec)),
        brightness: 1,
      });
    }
    sprites.push(...expandBurst(firework, config, worldConfig));

    for (const point of trails.points(firework.spec.id)) {
      sprites.push({
        kind: "trail",
        position: point.position,
        size: config.shellSize,
        color: parseHexColor(firstColor(firework.spec)),
        brightness: Math.max(0, 1 - point.ageMs / config.trailMaxAgeMs),
      });
    }
  }

  return { sprites, ambient: [] };
}

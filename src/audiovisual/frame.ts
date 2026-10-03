import { parseHexColor } from "./color.ts";
import { lerpVec3 } from "./interpolate.ts";
import { expandBurst } from "./sparks.ts";
import type { createTrails } from "./trails.ts";
import type { AudioVisualConfig } from "./config.ts";
import type { WorldConfig } from "../action/worldConfig.ts";
import type { Sprite, Frame } from "./types.ts";
import type { Firework, Vec3 } from "../action/types.ts";

// A shell is visible while it's actually moving under its own power or
// ballistically — not while "armed" (not yet launched) and not once a
// burst has started, when the shell itself is gone and only its sparks
// remain (cycle 12).
const SHELL_VISIBLE_PHASES = new Set(["launching", "flying"]);

// A recorded trail point does not move.
const STILL: Vec3 = { x: 0, y: 0, z: 0 };

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
 * Returns no `ambient` list: the movers come from `createAmbient`, and the
 * layer adds them.
 */
export function buildFrame(options: {
  readonly entities: readonly Firework[];
  readonly alpha: number;
  readonly config: AudioVisualConfig;
  readonly worldConfig: WorldConfig;
  readonly trails: ReturnType<typeof createTrails>;
}): Omit<Frame, "ambient"> {
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
        velocity: firework.velocity,
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
        velocity: STILL,
      });
    }
  }

  return { sprites };
}

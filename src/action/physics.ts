import { add, normalise, scale } from "./vector.ts";
import type { Firework } from "./types.ts";
import type { WorldConfig } from "./worldConfig.ts";
import type { Vec3 } from "./types.ts";

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * One fixed physics step: semi-implicit Euler under gravity, wind, drag
 * and thrust. `velocity` updates from acceleration first, then `position`
 * updates from the *new* velocity — not plain Euler, which would use the
 * old velocity and visibly bleed energy out of an arc. See "Physics" in
 * docs/04_plan_action_layer.md.
 *
 * Pure: returns a new `Firework`, never mutates the one it's given. Only
 * `position`, `previousPosition` and `velocity` change here — fuel/fuse
 * countdown and phase transitions are `stepPhase`'s job (cycle 12), not
 * this function's; `fuelRemainingMs` is only read here, to decide whether
 * thrust still applies.
 */
export function stepPhysics(
  firework: Firework,
  worldConfig: WorldConfig,
  dtMs: number,
): Firework {
  const dt = dtMs / 1000;

  const thrustAccel =
    firework.fuelRemainingMs > 0
      ? scale(normalise(firework.spec.velocity), firework.spec.thrust)
      : ZERO;
  const dragAccel = scale(firework.velocity, -worldConfig.drag);
  const acceleration = add(
    add(add(worldConfig.gravity, worldConfig.wind), dragAccel),
    thrustAccel,
  );

  const velocity = add(firework.velocity, scale(acceleration, dt));
  const position = add(firework.position, scale(velocity, dt));

  return {
    ...firework,
    previousPosition: firework.position,
    position,
    velocity,
  };
}

import type { Firework } from "../types.ts";

/**
 * Turns a Firework into one line of text. Pure — it returns a string, it
 * does not print one. `createSpecConsoleSink` is the one-line function
 * that actually calls `console.debug`; keeping the two apart means this
 * format can be asserted directly in a test, with no console spying. Same
 * split as the Control layer's `formatControlEvent`.
 */
export function formatFirework(firework: Firework): string {
  const { x, y, z } = firework.position;
  return `${firework.spec.id} phase=${firework.phase} pos=(${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}) pattern=${firework.spec.pattern}`;
}

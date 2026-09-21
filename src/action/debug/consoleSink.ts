import { formatFirework } from "./format.ts";
import type { Firework } from "../types.ts";

/**
 * Builds a sink that prints each firework through `log`, defaulting to
 * `console.debug`. This is the only place `console.debug` is called —
 * `formatFirework` stays pure, so the text itself is tested without
 * spying on `console`. Same split as the Control layer's
 * `createConsoleSink`.
 */
export function createSpecConsoleSink(
  log: (line: string) => void = console.debug,
): (firework: Firework) => void {
  return (firework) => {
    log(formatFirework(firework));
  };
}

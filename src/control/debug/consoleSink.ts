import { formatControlEvent } from "./format.ts";
import type { ControlEventSink } from "../types.ts";

/**
 * Builds a sink that prints each event through `log`, defaulting to
 * `console.debug`. This is the only place `console.debug` is called —
 * `formatControlEvent` stays pure, so the text itself is tested without
 * spying on `console`.
 */
export function createConsoleSink(
  log: (line: string) => void = console.debug,
): ControlEventSink {
  return (event) => {
    log(formatControlEvent(event));
  };
}

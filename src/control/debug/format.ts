import type { ControlEvent } from '../types.ts'

/**
 * Turns a ControlEvent into one line of text. Pure — it returns a string,
 * it does not print one. `createConsoleSink` is the one-line function that
 * actually calls `console.debug`; keeping the two apart means this format
 * can be asserted directly in a test, with no console spying.
 */
export function formatControlEvent(event: ControlEvent): string {
  const { signal } = event
  return `${event.kind} ${signal.id} shift=${String(signal.shift)} intensity=${String(signal.intensity)} source=${signal.source} t=${String(signal.timestamp)}`
}

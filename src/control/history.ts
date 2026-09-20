import type { ControlConfig } from "./config.ts";
import type { ControlSignal } from "./types.ts";

/**
 * A bounded, timestamped store of recent signals. Two limits, count and
 * age. It stores signals. It does not read them for meaning — that is the
 * Action layer's job, once it exists.
 *
 * `now` is a clock function, not a call to `performance.now()` inside this
 * file. Tests pass a fake clock so age-based eviction is testable without
 * waiting on real time.
 */
export function createHistory(config: ControlConfig, now: () => number) {
  let entries: ControlSignal[] = [];

  return {
    /** Add a signal. Drops the oldest entry first if this push goes over
     * `config.historyMaxEntries`. */
    push(signal: ControlSignal): void {
      entries.push(signal);
      if (entries.length > config.historyMaxEntries) {
        entries = entries.slice(entries.length - config.historyMaxEntries);
      }
    },

    /** Signals still within `config.historyMaxAgeMs` of `now()`, oldest
     * first. Age is checked here, at read time, not at push time — a
     * signal can go stale with no new push to trigger the check. Returns
     * a copy; mutating the result does not change stored state. */
    recent(): readonly ControlSignal[] {
      const cutoff = now() - config.historyMaxAgeMs;
      entries = entries.filter((entry) => entry.timestamp >= cutoff);
      return [...entries];
    },

    /** Empty the buffer. A push after this starts a new, empty history. */
    clear(): void {
      entries = [];
    },
  };
}

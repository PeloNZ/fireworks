// Saved settings laid over the defaults. See docs/13_settings_overrides.md.

import type { Settings } from "../config.ts";

const STORAGE_KEY = "fireworks.settings";

/** The slice of `Storage` that this file uses. */
interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The defaults with the settings saved in `store` laid over them. Nothing
 * saved, text that is not JSON and a store that throws (a private window, or
 * blocked site data) all give the defaults, so a bad store never stops the
 * page from loading.
 */
export function loadSettings(
  store: Pick<SettingsStore, "getItem">,
  defaults: Settings,
): Settings {
  try {
    const text = store.getItem(STORAGE_KEY);
    return text === null
      ? defaults
      : mergeOverrides(defaults, JSON.parse(text));
  } catch {
    return defaults;
  }
}

/**
 * `defaults` with the values from `overrides` laid over it. Storage can hold
 * anything, so a saved value is used only when it has the type of its default:
 *
 * - A number must be finite.
 * - A string must be a string.
 * - An object is merged key by key, so a saved `gravity.y` keeps `gravity.x`.
 *   A key with no default is ignored.
 * - A list keeps its default, because nothing checks its items.
 */
export function mergeOverrides<T>(defaults: T, overrides: unknown): T {
  if (typeof defaults === "number") {
    const usable = typeof overrides === "number" && Number.isFinite(overrides);
    return (usable ? overrides : defaults) as T;
  }
  if (typeof defaults === "string") {
    return (typeof overrides === "string" ? overrides : defaults) as T;
  }
  if (
    typeof defaults === "object" &&
    defaults !== null &&
    !Array.isArray(defaults)
  ) {
    if (typeof overrides !== "object" || overrides === null) {
      return defaults;
    }
    const saved = overrides as Record<string, unknown>;
    const merged = { ...defaults } as Record<string, unknown>;
    for (const key of Object.keys(merged)) {
      if (Object.hasOwn(saved, key)) {
        merged[key] = mergeOverrides(merged[key], saved[key]);
      }
    }
    return merged as T;
  }
  return defaults;
}

/**
 * Saves the fields of the settings form. A field name is a dotted path into
 * `Settings`, for example `world.drag`. The default at that path says how to
 * read the value: a string stays a string, a number is parsed. A path with no
 * default, and a number that is empty or not finite, are left out.
 */
export function applySettingsForm(
  entries: Iterable<readonly [string, FormDataEntryValue]>,
  store: SettingsStore,
  defaults: Settings,
): "saved" {
  const saved: Record<string, unknown> = {};
  for (const [name, value] of entries) {
    const path = name.split(".");
    const initial = path.reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null && Object.hasOwn(node, part)
          ? (node as Record<string, unknown>)[part]
          : undefined,
      defaults,
    );
    let converted: FormDataEntryValue | number;
    if (typeof initial === "string") {
      converted = value;
    } else if (typeof initial === "number") {
      converted =
        typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    } else {
      continue;
    }
    if (typeof converted === "number" && !Number.isFinite(converted)) {
      continue;
    }
    let target = saved;
    for (const [index, part] of path.entries()) {
      if (index === path.length - 1) {
        target[part] = converted;
      } else {
        target = (target[part] ??= {}) as Record<string, unknown>;
      }
    }
  }
  store.setItem(STORAGE_KEY, JSON.stringify(saved));
  return "saved";
}

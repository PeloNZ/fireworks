// Saved settings laid over the defaults. See docs/13_settings_overrides.md.

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

// Saved settings laid over the defaults. See docs/13_settings_overrides.md.

/**
 * `defaults` with the values from `overrides` laid over it. A nested object
 * is merged key by key, so a saved `gravity.y` keeps `gravity.x`.
 */
export function mergeOverrides<T extends object>(
  defaults: T,
  overrides: object,
): T {
  const merged = { ...defaults } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    const base = merged[key];
    merged[key] =
      typeof base === "object" && base !== null
        ? mergeOverrides(base, value as object)
        : value;
  }
  return merged as T;
}

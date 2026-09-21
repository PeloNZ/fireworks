// The lookup rule behind `?renderer=<name>` — no DOM, no glyphs, just
// which named entry runs. See "Selecting a renderer" in
// docs/07_emoji_renderer.md.

/**
 * Picks one entry from `renderers` by name, falling back to the entry
 * named `fallback` when `requested` is unknown or `null` (no
 * `?renderer=` in the URL at all).
 *
 * Returns the **name** alongside the factory, not just the factory: the
 * name doubles as the `<pre>`'s CSS class in `main.ts`, so a fallback has
 * to report its own name — returning the requested name here would style
 * the page for a renderer that never actually ran.
 *
 * Throws if `fallback` itself is missing from `renderers`. That is a
 * call-site bug, not a bad URL, so this project states it with an
 * explicit throw rather than a non-null assertion — see `rampChar` and
 * `frame.ts`'s `firstColor` for the standing pattern.
 */
export function selectRenderer<T>(
  requested: string | null,
  renderers: Readonly<Record<string, T>>,
  fallback: string,
): { readonly name: string; readonly create: T } {
  if (requested !== null && requested in renderers) {
    const create = renderers[requested];
    if (create === undefined) {
      throw new Error(`unreachable: "${requested}" is in renderers`);
    }
    return { name: requested, create };
  }

  const create = renderers[fallback];
  if (create === undefined) {
    throw new Error(
      `selectRenderer: fallback "${fallback}" is not in renderers`,
    );
  }
  return { name: fallback, create };
}

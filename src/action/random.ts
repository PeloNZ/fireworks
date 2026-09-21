// FNV-1a, 32-bit. Not cryptographic — the point is a fast, well-known
// algorithm that gives a stable, well-distributed number for a short
// string, so the same key id always seeds the same "family" of choices.
// See docs/04_plan_action_layer.md's "Seeded randomness".
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/** Hashes `text` into a 32-bit unsigned integer. Pure: the same string
 * always returns the same number, on any machine. */
export function hashString(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

// The named sound sets `?sound=` picks between, via `selectRenderer` — the
// same lookup `?renderer=` already uses against a different table. See
// docs/08_sound_effects.md.

import { planToneVoices } from "./tones.ts";
import { planSillyVoices } from "./silly.ts";
import type { VoicePlanner } from "../types.ts";

export const soundSets: Record<string, VoicePlanner> = {
  tones: planToneVoices,
  silly: planSillyVoices,
};

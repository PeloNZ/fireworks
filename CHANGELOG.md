# Changelog

This file follows the [Keep a Changelog](https://keepachangelog.com/) format. It records user-facing changes, security fixes, and database migrations. It does not record developer-facing work — refactors, tests, tooling, or documentation-only changes.

## [Unreleased]

### Added

- A world backdrop behind the fireworks: a sky gradient running anywhere from solid black to a dim sunset, a scatter of stars with a moon and a planet, and a ground silhouette along the bottom. One seed is drawn on each page load, so refreshing deals a new sky, and a brighter horizon thins the star field the way a real sunset does. Nothing in the backdrop can dim a firework — the fireworks win every cell they draw in. See `docs/06_world_backdrop.md`.
- A second renderer, in emoji instead of characters: load the page with `?renderer=emoji` in the URL and every firework, its sparks, and the sky behind them draw as coloured emoji instead of the character grid, with a spark's colour picking the nearest coloured circle to its hue — a fact the character grid could never show. The character grid stays the default when no `?renderer=` is given, and an unrecognised value falls back to it too. See `docs/07_emoji_renderer.md`.
- A dark page. The character grid renders light-on-dark, which the brightness ramp has always assumed; until now it drew inverted against the browser's default white background.
- A third renderer, in 8-bit pixel art instead of characters or emoji: load the page with `?renderer=pixel` to fill the whole browser window with a fixed 16-colour palette. Every sprite draws as the real disc its size describes rather than a single cell, so a trail visibly tapers as it fades and a spark shrinks with it — neither the character grid nor the emoji grid can do this. The internal grid fills the window's full height on any window shape, so a round burst always stays round. See `docs/09_8bit_renderer.md`.
- A settings menu: press Esc to pick the renderer and the sound set from a list, then press Apply. The page reloads with your choice in the URL. No firework launches while the menu is open, and Esc no longer launches one. See `docs/10_settings_ui.md`.

Everything before this was internal: the Control, Action and AudioVisual layers and their supporting tooling, with no visible surface to change.

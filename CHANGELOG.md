# Changelog

This file follows the [Keep a Changelog](https://keepachangelog.com/) format. It records user-facing changes, security fixes, and database migrations. It does not record developer-facing work — refactors, tests, tooling, or documentation-only changes.

## [Unreleased]

### Added

- A world backdrop behind the fireworks: a sky gradient running anywhere from solid black to a dim sunset, a scatter of stars with a moon and a planet, and a ground silhouette along the bottom. One seed is drawn on each page load, so refreshing deals a new sky, and a brighter horizon thins the star field the way a real sunset does. Nothing in the backdrop can dim a firework — the fireworks win every cell they draw in. See `docs/06_world_backdrop.md`.
- A dark page. The character grid renders light-on-dark, which the brightness ramp has always assumed; until now it drew inverted against the browser's default white background.

Everything before this was internal: the Control, Action and AudioVisual layers and their supporting tooling, with no visible surface to change.

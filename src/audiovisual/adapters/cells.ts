import type { Frame, Sprite } from "../types.ts";

// The geometry and the cell contest, shared by every renderer that works
// in world-to-grid cells — ASCII and emoji today. No character or glyph
// is named anywhere in this file; that decision belongs to each adapter.
// See "The shared seam: contestCells" in docs/07_emoji_renderer.md.

/**
 * Maps a world point onto a grid cell, flipping `y` — world `y` grows up,
 * grid rows grow down. Returns `null` when the point falls outside the
 * grid, which is what clips a sprite rather than wrapping it to the
 * opposite edge.
 *
 * The box is **half-open**: `x = 50` lands on `column === columns` and
 * `y = 100` on `row === -1`, so both are outside. Renderable world space
 * is `x ∈ [-50, 50)` and `y ∈ [0, 100)`.
 *
 * The grid parameter is an inline shape rather than
 * `AudioVisualConfig["ascii"]` — both `ascii` and `emoji` config slices
 * have `columns` and `rows`, so both are assignable here with no adapter
 * needing to unpack its own slice first. The return type is likewise
 * inline: a type nothing else imports is dead code `knip` would flag.
 */
export function toCell(
  x: number,
  y: number,
  grid: { readonly columns: number; readonly rows: number },
): { readonly row: number; readonly column: number } | null {
  const { columns, rows } = grid;
  const column = Math.floor(((x + 50) / 100) * columns);
  const row = rows - 1 - Math.floor((y / 100) * rows);
  if (column < 0 || column >= columns || row < 0 || row >= rows) {
    return null;
  }
  return { row, column };
}

/**
 * The world `y` at the vertical centre of `row` — the exact inverse of
 * `toCell`'s `row = rows - 1 - floor((y / 100) * rows)`. Centres rather
 * than edges, so a backdrop sampled here reads as the true gradient
 * rounded to the nearest cell, with no systematic bias up or down.
 */
export function rowCentreY(row: number, rows: number): number {
  return (100 * (rows - row - 0.5)) / rows;
}

/**
 * The world `x` at the horizontal centre of `column` — the inverse of
 * `toCell`'s `column = floor(((x + 50) / 100) * columns)`. Centres again,
 * so a sampled skyline reads as the true height rounded to the nearest
 * cell, with no bias left or right.
 */
export function columnCentreX(column: number, columns: number): number {
  return -50 + (100 * (column + 0.5)) / columns;
}

/**
 * Decides which sprite wins each cell of the grid — the half of
 * `rasteriseFrame`'s old job that has nothing to do with characters. When
 * two sprites land in one cell, the brighter one wins; on equal
 * brightness the earlier sprite in `frame.sprites` keeps it, unchanged
 * from `rasteriseFrame`'s own tie-break, and load-bearing for the same
 * reason `docs/06_world_backdrop.md` documents: it is what lets a dimmer,
 * later sprite (a decaying trail) never displace one that got there
 * first. An empty cell is `null`, never a placeholder sprite.
 */
export function contestCells(
  frame: Frame,
  grid: { readonly columns: number; readonly rows: number },
): readonly (Sprite | null)[][] {
  const { columns, rows } = grid;
  const cells: (Sprite | null)[][] = [];
  for (let row = 0; row < rows; row++) {
    cells.push(new Array<Sprite | null>(columns).fill(null));
  }

  const rowAt = (row: number): (Sprite | null)[] => {
    const line = cells[row];
    if (line === undefined) {
      // row always comes from toCell, which already rejected anything
      // outside [0, rows). noUncheckedIndexedAccess can't see that.
      throw new Error("unreachable: cell row outside the grid");
    }
    return line;
  };

  for (const sprite of frame.sprites) {
    const cell = toCell(sprite.position.x, sprite.position.y, grid);
    if (cell === null) {
      continue;
    }
    const existing = rowAt(cell.row)[cell.column];
    if (existing && existing.brightness >= sprite.brightness) {
      continue;
    }
    rowAt(cell.row)[cell.column] = sprite;
  }

  return cells;
}

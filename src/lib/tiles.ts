// Tileset grid: where each tile sits in the image, given tile size, margin and spacing. No DOM.
import type { Img, Rect } from "./pixels.ts";

/** margin = empty border around the whole tileset, spacing = empty gap between tiles */
export type Grid = { tileW: number; tileH: number; margin: number; spacing: number };

/** How many whole tiles fit across and down; leftovers at the edges are ignored */
export function gridSize(w: number, h: number, g: Grid): { cols: number; rows: number } {
  const fit = (size: number, tile: number) => Math.max(0, Math.floor((size - 2 * g.margin + g.spacing) / (tile + g.spacing)));
  return { cols: fit(w, g.tileW), rows: fit(h, g.tileH) };
}

export const tileRect = (g: Grid, col: number, row: number): Rect => ({
  x: g.margin + col * (g.tileW + g.spacing),
  y: g.margin + row * (g.tileH + g.spacing),
  w: g.tileW,
  h: g.tileH,
});

/** Index (row * cols + col, the numbering engines use) of the tile under an image pixel,
 *  or null when the pixel is in the margin, a gap or past the last tile */
export function tileAt(px: number, py: number, g: Grid, cols: number, rows: number): number | null {
  const col = Math.floor((px - g.margin) / (g.tileW + g.spacing));
  const row = Math.floor((py - g.margin) / (g.tileH + g.spacing));
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  const r = tileRect(g, col, row);
  if (px >= r.x + r.w || py >= r.y + r.h) return null;
  return row * cols + col;
}

export function isEmptyTile(img: Img, r: Rect): boolean {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (x < img.w && y < img.h && img.data[(y * img.w + x) * 4 + 3] > 0) return false;
  return true;
}

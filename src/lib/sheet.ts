// Sprite sheet layout: every sprite gets a cell the size of the biggest one, in a grid. No DOM.
import { blank, getPixel, setPixel, type Img, type Rect } from "./pixels.ts";

/** Where a sprite sits inside a cell bigger than itself.
 *  bottom = centered on the floor of the cell, so characters of different heights stand on the same line. */
export type Align = "center" | "top-left" | "bottom";

export type SheetOptions = { columns: number; spacing: number; padding: number; align: Align };

export type Sheet = { img: Img; cellW: number; cellH: number; columns: number; rows: number; cells: Rect[] };

export function buildSheet(sprites: Img[], o: SheetOptions): Sheet {
  const n = sprites.length;
  const columns = Math.min(Math.max(1, Math.floor(o.columns)), Math.max(1, n));
  const rows = Math.max(1, Math.ceil(n / columns));
  const cellW = Math.max(1, ...sprites.map((s) => s.w));
  const cellH = Math.max(1, ...sprites.map((s) => s.h));
  const img = blank(
    2 * o.padding + columns * cellW + (columns - 1) * o.spacing,
    2 * o.padding + rows * cellH + (rows - 1) * o.spacing,
  );
  const cells = sprites.map((s, i) => {
    const cell = {
      x: o.padding + (i % columns) * (cellW + o.spacing),
      y: o.padding + Math.floor(i / columns) * (cellH + o.spacing),
      w: cellW,
      h: cellH,
    };
    const dx = o.align === "top-left" ? 0 : Math.floor((cellW - s.w) / 2);
    const dy = o.align === "top-left" ? 0 : o.align === "bottom" ? cellH - s.h : Math.floor((cellH - s.h) / 2);
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) setPixel(img, cell.x + dx + x, cell.y + dy + y, getPixel(s, x, y));
    return cell;
  });
  return { img, cellW, cellH, columns, rows, cells };
}

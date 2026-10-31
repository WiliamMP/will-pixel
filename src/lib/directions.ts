// Character directions laid out as sheet rows, with the drawings lined up across directions. No DOM.
import { blank, clone, crop, flip, full, type Img, type Rect } from "./pixels.ts";

/** Row order of the sheet: down, left, right, up (the RPG Maker order most engines and tutorials use) */
export const DIRECTIONS = [
  { id: "down", label: "Sul (frente)" },
  { id: "left", label: "Oeste (esquerda)" },
  { id: "right", label: "Leste (direita)" },
  { id: "up", label: "Norte (costas)" },
] as const;

export type Direction = (typeof DIRECTIONS)[number]["id"];

/** Smallest rectangle holding every visible pixel of all the images, or null when they are all empty */
export function unionBounds(imgs: Img[]): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (const img of imgs)
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++)
        if (img.data[(y * img.w + x) * 4 + 3] > 0) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export const mirrored = (imgs: Img[]) =>
  imgs.map((img) => {
    const out = clone(img);
    flip(out, full(out), true);
    return out;
  });

/** Cuts the empty space around a direction's frames with one box for all of them,
 *  so the animation keeps its own motion (a bob of 1px stays a bob of 1px) */
export function trimRow(imgs: Img[]): Img[] {
  const r = unionBounds(imgs);
  return r ? imgs.map((img) => crop(img, r)) : imgs;
}

/** Rows flattened for buildSheet: short rows are padded with empty 1x1 images,
 *  so each direction starts its own row and the rows keep their order even when one is empty */
export function gridSprites(rows: Img[][]): { sprites: Img[]; columns: number } {
  const columns = Math.max(1, ...rows.map((r) => r.length));
  const sprites = rows.flatMap((r) => [...r, ...Array.from({ length: columns - r.length }, () => blank(1, 1))]);
  return { sprites, columns };
}

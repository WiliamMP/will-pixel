// Pure pixel helpers, no DOM. The image is RGBA bytes row by row, same layout as canvas ImageData.
export type Img = { w: number; h: number; data: Uint8ClampedArray<ArrayBuffer> };
export type RGBA = [number, number, number, number];

export const CLEAR: RGBA = [0, 0, 0, 0];

export function blank(w: number, h: number): Img {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export function clone(img: Img): Img {
  return { w: img.w, h: img.h, data: img.data.slice() };
}

export function inside(img: Img, x: number, y: number) {
  return x >= 0 && y >= 0 && x < img.w && y < img.h;
}

export function getPixel(img: Img, x: number, y: number): RGBA {
  const i = (y * img.w + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

export function setPixel(img: Img, x: number, y: number, c: RGBA) {
  if (!inside(img, x, y)) return;
  img.data.set(c, (y * img.w + x) * 4);
}

/** Every pixel from (x0,y0) to (x1,y1), Bresenham. Fills the gaps of a fast mouse stroke. */
export function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Paint bucket: replaces the 4-connected area that has exactly the color under (x,y) */
export function fill(img: Img, x: number, y: number, c: RGBA) {
  if (!inside(img, x, y)) return;
  const target = getPixel(img, x, y).join();
  if (target === c.join()) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (!inside(img, px, py) || getPixel(img, px, py).join() !== target) continue;
    setPixel(img, px, py, c);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

/** Symmetry while drawing: h = left/right mirror, v = top/bottom, both = 4 quadrants, radial = 4 rotations of 90° */
export type Symmetry = "off" | "h" | "v" | "both" | "radial";

/** A pixel plus its symmetric copies in a w x h image (duplicates when the pixel sits on an axis) */
export function mirrorPoints(x: number, y: number, w: number, h: number, mode: Symmetry): [number, number][] {
  const mx = w - 1 - x;
  const my = h - 1 - y;
  if (mode === "h") return [[x, y], [mx, y]];
  if (mode === "v") return [[x, y], [x, my]];
  if (mode === "both") return [[x, y], [mx, y], [x, my], [mx, my]];
  if (mode === "radial") {
    // offsets from the center, doubled so a center between pixels stays an integer
    const dx = 2 * x - (w - 1);
    const dy = 2 * y - (h - 1);
    const rotations: [number, number][] = [[dx, dy], [-dy, dx], [-dx, -dy], [dy, -dx]];
    // on a non-square image some rotations fall between pixels: skip those
    return rotations
      .map(([rx, ry]): [number, number] => [(rx + w - 1) / 2, (ry + h - 1) / 2])
      .filter(([px, py]) => Number.isInteger(px) && Number.isInteger(py));
  }
  return [[x, y]];
}

export type Rect = { x: number; y: number; w: number; h: number };

export const full = (img: Img): Rect => ({ x: 0, y: 0, w: img.w, h: img.h });

/** Rectangle with corners at two pixels, in any order, both included */
export function rectBetween(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax) + 1, h: Math.abs(by - ay) + 1 };
}

/** The part of r inside the image, or null when nothing is left */
export function clampRect(r: Rect, img: Img): Rect | null {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  const w = Math.min(img.w, r.x + r.w) - x;
  const h = Math.min(img.h, r.y + r.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

function* pixelsOf(r: Rect) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) yield [x, y] as const;
}

/** Copy of the part of the image under r; what falls outside the image is transparent */
export function crop(img: Img, r: Rect): Img {
  const out = blank(r.w, r.h);
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) if (inside(img, r.x + x, r.y + y)) setPixel(out, x, y, getPixel(img, r.x + x, r.y + y));
  return out;
}

export function clearRect(img: Img, r: Rect) {
  for (const [x, y] of pixelsOf(r)) setPixel(img, x, y, CLEAR);
}

/** Copy of the image with the pixels of r moved by (dx,dy). What goes past the edge is cut off;
 *  transparent pixels of the moved piece don't cover what is under them. */
export function moveRect(img: Img, r: Rect, dx: number, dy: number): Img {
  const out = clone(img);
  clearRect(out, r);
  for (const [x, y] of pixelsOf(r)) {
    if (!inside(img, x, y)) continue;
    const p = getPixel(img, x, y);
    if (p[3] > 0) setPixel(out, x + dx, y + dy, p);
  }
  return out;
}

/** Mirrors the pixels of r in place. r must be inside the image (see clampRect). */
export function flip(img: Img, r: Rect, horizontal: boolean) {
  const src = clone(img);
  for (const [x, y] of pixelsOf(r)) {
    const sx = horizontal ? 2 * r.x + r.w - 1 - x : x;
    const sy = horizontal ? y : 2 * r.y + r.h - 1 - y;
    setPixel(img, x, y, getPixel(src, sx, sy));
  }
}

export function hexToRgba(hex: string): RGBA {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function rgbaToHex([r, g, b]: RGBA): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

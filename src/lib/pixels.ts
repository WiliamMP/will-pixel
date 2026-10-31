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

export function hexToRgba(hex: string): RGBA {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function rgbaToHex([r, g, b]: RGBA): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

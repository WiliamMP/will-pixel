// Color math for the picker and the palette tools, no DOM.
// Colors are "#rrggbb" strings at the edges and RGB triples (0..255) inside.
import type { Img } from "./pixels.ts";

export type RGB = [number, number, number];
export type HSV = [h: number, s: number, v: number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(c: RGB): string {
  return "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** h in degrees 0..360, s and v 0..1 */
export function rgbToHsv([r, g, b]: RGB): HSV {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return [f(5), f(3), f(1)];
}

const toLinear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** OKLab: a color space where equal distances look equally different */
function oklab([r, g, b]: RGB): RGB {
  const [R, G, B] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance: 0 = same color, 1 = black vs white, below ~0.02 is hard to tell apart */
export function distance(a: RGB, b: RGB) {
  const p = oklab(a);
  const q = oklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Below this, two palette colors are flagged as "very similar" */
export const SIMILAR = 0.04;

export function similarPairs(hexes: string[], threshold = SIMILAR): [string, string][] {
  const rgb = hexes.map(hexToRgb);
  const out: [string, string][] = [];
  for (let i = 0; i < rgb.length; i++)
    for (let j = i + 1; j < rgb.length; j++) if (distance(rgb[i], rgb[j]) < threshold) out.push([hexes[i], hexes[j]]);
  return out;
}

export function nearest(c: RGB, palette: RGB[]): RGB {
  let best = palette[0];
  let bestD = Infinity;
  for (const p of palette) {
    const d = distance(c, p);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best;
}

/** Copy of the image with every visible pixel replaced by the closest palette color */
export function remap(img: Img, palette: string[]): Img {
  const pal = palette.map(hexToRgb);
  const data = img.data.slice();
  const cache = new Map<number, RGB>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let c = cache.get(key);
    if (!c) cache.set(key, (c = nearest([data[i], data[i + 1], data[i + 2]], pal)));
    data.set(c, i);
  }
  return { w: img.w, h: img.h, data };
}

type Weighted = { c: RGB; n: number };

/** Median cut: splits the colors into `max` boxes along their widest channel and averages each box */
function medianCut(items: Weighted[], max: number): RGB[] {
  const boxes = [items];
  while (boxes.length < max) {
    let pick = -1;
    let channel = 0;
    let widest = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255;
        let hi = 0;
        for (const it of box) {
          lo = Math.min(lo, it.c[ch]);
          hi = Math.max(hi, it.c[ch]);
        }
        if (hi - lo > widest) [pick, channel, widest] = [i, ch, hi - lo];
      }
    });
    if (pick < 0) break;
    const box = boxes[pick].slice().sort((a, b) => a.c[channel] - b.c[channel]);
    const total = box.reduce((s, it) => s + it.n, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.length - 1; i++) {
      acc += box[i].n;
      cut = i + 1;
      if (acc >= total / 2) break;
    }
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes.map((box) => {
    const total = box.reduce((s, it) => s + it.n, 0);
    return [0, 1, 2].map((ch) => box.reduce((s, it) => s + it.c[ch] * it.n, 0) / total) as RGB;
  });
}

/** The colors of an image, most used first. More than `max` colors are reduced with median cut. */
export function extractColors(img: Img, max: number): string[] {
  const counts = new Map<number, number>();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const items: Weighted[] = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ c: [(k >> 16) & 255, (k >> 8) & 255, k & 255], n }));
  const colors = items.length <= max ? items.map((it) => it.c) : medianCut(items, max);
  return [...new Set(colors.map(rgbToHex))];
}

/** Difference of two RGBA pixels: both transparent = 0, transparent vs visible = 1, else perceptual */
function pixelDistance(img: Img, i: number, j: number) {
  const d = img.data;
  if (!d[i + 3] && !d[j + 3]) return 0;
  if (!d[i + 3] || !d[j + 3]) return 1;
  return distance([d[i], d[i + 1], d[i + 2]], [d[j], d[j + 1], d[j + 2]]);
}

/** Smallest jump across an edge that counts as a seam, even on a flat texture */
const SEAM_MIN = 0.08;

/** Where the image breaks when repeated: `rows` = y where the right edge doesn't continue into the left one,
 *  `cols` = x where the bottom edge doesn't continue into the top one.
 *  ponytail: a jump counts as a seam when it is bigger than twice the texture's own average jump;
 *  good for pixel art, a gradient-aware check if noisy textures give false alarms */
export function seams(img: Img): { rows: number[]; cols: number[] } {
  const { w, h } = img;
  const at = (x: number, y: number) => (y * w + x) * 4;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x + 1 < w) sumX += pixelDistance(img, at(x, y), at(x + 1, y));
      if (y + 1 < h) sumY += pixelDistance(img, at(x, y), at(x, y + 1));
    }
  const limitX = Math.max(SEAM_MIN, (2 * sumX) / Math.max(1, (w - 1) * h));
  const limitY = Math.max(SEAM_MIN, (2 * sumY) / Math.max(1, w * (h - 1)));
  const rows: number[] = [];
  const cols: number[] = [];
  for (let y = 0; y < h; y++) if (pixelDistance(img, at(w - 1, y), at(0, y)) > limitX) rows.push(y);
  for (let x = 0; x < w; x++) if (pixelDistance(img, at(x, h - 1), at(x, 0)) > limitY) cols.push(x);
  return { rows, cols };
}

/** Moves hue h toward target by at most `deg` degrees, the short way around the circle */
function shiftHue(h: number, target: number, deg: number) {
  const diff = ((target - h + 540) % 360) - 180;
  return (h + Math.sign(diff) * Math.min(Math.abs(diff), deg) + 360) % 360;
}

/** Shades and tints of a color, darkest first, the color itself in the middle.
 *  Pixel art hue shifting: shadows drift toward blue, highlights toward yellow. */
export function ramp(hex: string, steps = 3): string[] {
  const [h, s, v] = rgbToHsv(hexToRgb(hex));
  const out: string[] = [];
  for (let i = -steps; i <= steps; i++) {
    if (i === 0) {
      out.push(hex.toLowerCase());
      continue;
    }
    const t = Math.abs(i) / steps;
    const dark = i < 0;
    const hue = shiftHue(h, dark ? 240 : 60, 24 * t);
    const sat = clamp01(dark ? s + 0.15 * t : s - 0.35 * t);
    const val = clamp01(dark ? v * (1 - 0.65 * t) : v + (1 - v) * 0.8 * t);
    out.push(rgbToHex(hsvToRgb(hue, sat, val)));
  }
  return out;
}

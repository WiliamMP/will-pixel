/// <reference types="node" />
// Self-check of the sprite sheet layout: npm run check
import assert from "node:assert/strict";
import { blank, getPixel, setPixel } from "./pixels.ts";
import { buildSheet } from "./sheet.ts";

const red = [255, 0, 0, 255] as [number, number, number, number];
// a 4x4 sprite and a 2x2 one, each with its top-left pixel red
const big = blank(4, 4);
const small = blank(2, 2);
setPixel(big, 0, 0, red);
setPixel(small, 0, 0, red);

// 3 sprites in 2 columns: 2 rows, cells as big as the biggest sprite, spacing between, padding around
const s = buildSheet([big, small, small], { columns: 2, spacing: 1, padding: 2, align: "top-left" });
assert.deepEqual([s.img.w, s.img.h], [2 + 4 + 1 + 4 + 2, 2 + 4 + 1 + 4 + 2]);
assert.deepEqual([s.columns, s.rows, s.cellW, s.cellH], [2, 2, 4, 4]);
assert.deepEqual(s.cells[1], { x: 7, y: 2, w: 4, h: 4 });
assert.deepEqual(s.cells[2], { x: 2, y: 7, w: 4, h: 4 });
assert.deepEqual(getPixel(s.img, 7, 2), red);

// alignment of the small sprite inside its 4x4 cell
const center = buildSheet([big, small], { columns: 2, spacing: 0, padding: 0, align: "center" });
assert.deepEqual(getPixel(center.img, 4 + 1, 1), red);
const bottom = buildSheet([big, small], { columns: 2, spacing: 0, padding: 0, align: "bottom" });
assert.deepEqual(getPixel(bottom.img, 4 + 1, 2), red);

// more columns than sprites: a single row with no empty cells
assert.equal(buildSheet([big, small], { columns: 8, spacing: 0, padding: 0, align: "center" }).img.w, 8);
// no sprites: an empty 1x1 sheet instead of a crash
assert.deepEqual([buildSheet([], { columns: 4, spacing: 0, padding: 0, align: "center" }).img.w], [1]);

console.log("sheet ok");

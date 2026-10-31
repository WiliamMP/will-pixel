/// <reference types="node" />
// Self-check of the direction helpers: npm run check
import assert from "node:assert/strict";
import { crop, gridSprites, mirrored, trimRow, unionBounds } from "./directions.ts";
import { blank, getPixel, setPixel } from "./pixels.ts";
import { buildSheet } from "./sheet.ts";

const ink = [26, 22, 38, 255] as [number, number, number, number];

// bounds: union of the visible pixels of all frames; empty frames have none
const a = blank(8, 8);
const b = blank(8, 8);
setPixel(a, 2, 5, ink);
setPixel(b, 4, 6, ink);
assert.deepEqual(unionBounds([a, b]), { x: 2, y: 5, w: 3, h: 2 });
assert.equal(unionBounds([blank(4, 4)]), null);

// trimRow cuts both frames with the same box, so their relative position survives
const [ta, tb] = trimRow([a, b]);
assert.deepEqual([ta.w, ta.h], [3, 2]);
assert.deepEqual(getPixel(ta, 0, 0), ink);
assert.deepEqual(getPixel(tb, 2, 1), ink);

// crop outside a smaller image reads as transparent instead of garbage
assert.deepEqual(getPixel(crop(blank(2, 2), { x: 1, y: 1, w: 3, h: 3 }), 2, 2), [0, 0, 0, 0]);

// mirrored flips left and right without touching the original
const m = mirrored([a])[0];
assert.deepEqual(getPixel(m, 5, 5), ink);
assert.deepEqual(getPixel(a, 2, 5), ink);

// grid: 4 rows of different lengths; an empty row still takes its row in the sheet
const rows = [[a, b], [], [a], [a, b, a]];
const { sprites, columns } = gridSprites(rows);
assert.equal(columns, 3);
assert.equal(sprites.length, 12);
const sheet = buildSheet(sprites, { columns, spacing: 0, padding: 0, align: "bottom" });
assert.deepEqual([sheet.rows, sheet.cellW, sheet.cellH], [4, 8, 8]);
assert.deepEqual(sheet.cells[9], { x: 0, y: 24, w: 8, h: 8 }); // first frame of the 4th row (up)

// trimmed rows of different heights land with their feet on the same line (align bottom)
const tall = blank(4, 4);
const short = blank(4, 4);
setPixel(tall, 1, 0, ink);
setPixel(tall, 1, 3, ink);
setPixel(short, 1, 2, ink);
const lined = buildSheet([...trimRow([tall]), ...trimRow([short])], { columns: 2, spacing: 0, padding: 0, align: "bottom" });
assert.deepEqual([lined.cellW, lined.cellH], [1, 4]);
assert.deepEqual(getPixel(lined.img, 0, 3), ink); // feet of the tall one
assert.deepEqual(getPixel(lined.img, 1, 3), ink); // feet of the short one, same row

console.log("directions ok");

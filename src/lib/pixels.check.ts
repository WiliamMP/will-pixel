/// <reference types="node" />
// Self-check of the pixel helpers: npm run check
import assert from "node:assert/strict";
import {
  blank,
  clampRect,
  fill,
  flip,
  full,
  getPixel,
  hexToRgba,
  line,
  moveRect,
  rectBetween,
  rgbaToHex,
  setPixel,
} from "./pixels.ts";

// line: diagonal, reversed and single point have no gaps
assert.deepEqual(line(0, 0, 3, 3), [[0, 0], [1, 1], [2, 2], [3, 3]]);
assert.deepEqual(line(3, 0, 0, 0), [[3, 0], [2, 0], [1, 0], [0, 0]]);
assert.deepEqual(line(2, 2, 2, 2), [[2, 2]]);
assert.equal(line(0, 0, 5, 2).length, 6);

// fill stops at a wall: a vertical line at x=2 splits a 5x3 image
const img = blank(5, 3);
const red = hexToRgba("#c03838");
const wall = hexToRgba("#1a1626");
for (let y = 0; y < 3; y++) setPixel(img, 2, y, wall);
fill(img, 0, 0, red);
assert.deepEqual(getPixel(img, 1, 2), red);
assert.deepEqual(getPixel(img, 2, 1), wall);
assert.deepEqual(getPixel(img, 3, 0), [0, 0, 0, 0]);
// same color again is a no-op, not an endless loop
fill(img, 0, 0, red);

// out of bounds writes are ignored
setPixel(img, 9, 9, red);

// moveRect on the whole image moves pixels and cuts what leaves the image
const dot = blank(3, 3);
setPixel(dot, 0, 0, red);
const moved = moveRect(dot, full(dot), 1, 2);
assert.deepEqual(getPixel(moved, 1, 2), red);
assert.deepEqual(getPixel(moved, 0, 0), [0, 0, 0, 0]);
assert.ok(moveRect(dot, full(dot), 3, 0).data.every((v) => v === 0));

// moveRect on a selection moves only the piece; its transparent pixels keep what is below
const two = blank(4, 1);
setPixel(two, 0, 0, red);
setPixel(two, 2, 0, wall);
const slid = moveRect(two, rectBetween(0, 0, 1, 0), 1, 0);
assert.deepEqual([0, 1, 2, 3].map((x) => getPixel(slid, x, 0)[3]), [0, 255, 255, 0]);
assert.deepEqual(getPixel(slid, 2, 0), wall);
assert.deepEqual(getPixel(two, 0, 0), red); // the original is untouched

// flip mirrors only inside the rectangle
const row = blank(4, 2);
setPixel(row, 0, 0, red);
flip(row, rectBetween(0, 0, 2, 1), true);
assert.deepEqual(getPixel(row, 2, 0), red);
assert.deepEqual(getPixel(row, 0, 0), [0, 0, 0, 0]);
flip(row, full(row), false);
assert.deepEqual(getPixel(row, 2, 1), red);

assert.deepEqual(rectBetween(3, 1, 1, 2), { x: 1, y: 1, w: 3, h: 2 });
assert.deepEqual(clampRect({ x: -1, y: 2, w: 3, h: 5 }, row), null);
assert.deepEqual(clampRect({ x: -1, y: 0, w: 3, h: 5 }, row), { x: 0, y: 0, w: 2, h: 2 });

assert.equal(rgbaToHex(hexToRgba("#5a5a6a")), "#5a5a6a");
console.log("pixels ok");

/// <reference types="node" />
// Self-check of the pixel helpers: npm run check
import assert from "node:assert/strict";
import { blank, fill, getPixel, hexToRgba, line, rgbaToHex, setPixel, shift } from "./pixels.ts";

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

// shift moves pixels and cuts what leaves the image
const dot = blank(3, 3);
setPixel(dot, 0, 0, red);
const moved = shift(dot, 1, 2);
assert.deepEqual(getPixel(moved, 1, 2), red);
assert.deepEqual(getPixel(moved, 0, 0), [0, 0, 0, 0]);
assert.ok(shift(dot, 3, 0).data.every((v) => v === 0));

assert.equal(rgbaToHex(hexToRgba("#5a5a6a")), "#5a5a6a");
console.log("pixels ok");

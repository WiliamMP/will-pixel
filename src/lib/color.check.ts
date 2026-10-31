/// <reference types="node" />
// Self-check of the color helpers: npm run check
import assert from "node:assert/strict";
import { blank, getPixel, setPixel } from "./pixels.ts";
import {
  distance,
  extractColors,
  hexToRgb,
  hsvToRgb,
  remap,
  ramp,
  rgbToHex,
  rgbToHsv,
  similarPairs,
} from "./color.ts";

// hex and HSV round trips
for (const hex of ["#1a1626", "#c03838", "#ffffff", "#000000", "#60a4ff"])
  assert.equal(rgbToHex(hsvToRgb(...rgbToHsv(hexToRgb(hex)))), hex);
assert.deepEqual(rgbToHsv([255, 0, 0]), [0, 1, 1]);

// distance: same = 0, black/white about 1, close reds closer than red/blue
assert.equal(distance([10, 20, 30], [10, 20, 30]), 0);
assert.ok(Math.abs(distance([0, 0, 0], [255, 255, 255]) - 1) < 0.01);
assert.ok(distance([192, 56, 56], [200, 60, 60]) < distance([192, 56, 56], [56, 56, 192]));

// similar pairs: near-duplicate reds are flagged, distinct colors are not
assert.deepEqual(similarPairs(["#c03838", "#c43a3a", "#3a4466"]), [["#c03838", "#c43a3a"]]);
assert.deepEqual(similarPairs(["#000000", "#ffffff"]), []);

// extract: few colors come back exactly, most used first; many colors are reduced to max
const img = blank(4, 1);
setPixel(img, 0, 0, [255, 0, 0, 255]);
setPixel(img, 1, 0, [0, 0, 255, 255]);
setPixel(img, 2, 0, [0, 0, 255, 255]);
assert.deepEqual(extractColors(img, 16), ["#0000ff", "#ff0000"]);
const grad = blank(256, 1);
for (let x = 0; x < 256; x++) setPixel(grad, x, 0, [x, 255 - x, 128, 255]);
assert.equal(extractColors(grad, 8).length, 8);

// remap: every visible pixel becomes a palette color, transparent stays transparent
const mapped = remap(img, ["#e00000", "#0000c0"]);
assert.deepEqual(getPixel(mapped, 0, 0), [224, 0, 0, 255]);
assert.deepEqual(getPixel(mapped, 1, 0), [0, 0, 192, 255]);
assert.deepEqual(getPixel(mapped, 3, 0), [0, 0, 0, 0]);
assert.deepEqual(getPixel(img, 0, 0), [255, 0, 0, 255]); // the original is untouched

// ramp: 7 steps, the color in the middle, getting lighter from left to right
const r = ramp("#c03838");
assert.equal(r.length, 7);
assert.equal(r[3], "#c03838");
const value = (hex: string) => rgbToHsv(hexToRgb(hex))[2];
for (let i = 1; i < r.length; i++) assert.ok(value(r[i]) >= value(r[i - 1]), `${r[i - 1]} -> ${r[i]}`);

console.log("color ok");

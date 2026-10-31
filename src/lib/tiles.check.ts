/// <reference types="node" />
// Self-check of the tileset grid: npm run check
import assert from "node:assert/strict";
import { blank, setPixel } from "./pixels.ts";
import { buildSheet } from "./sheet.ts";
import { gridSize, isEmptyTile, tileAt, tileRect, type Grid } from "./tiles.ts";

// 16px tiles, 1px margin around and 2px between: 1 + 16 + 2 + 16 + 1 = 36 wide holds 2 columns
const g: Grid = { tileW: 16, tileH: 16, margin: 1, spacing: 2 };
assert.deepEqual(gridSize(36, 18, g), { cols: 2, rows: 1 });
assert.deepEqual(gridSize(35, 18, g), { cols: 1, rows: 1 }); // one pixel short: the second tile doesn't fit
assert.deepEqual(gridSize(10, 10, g), { cols: 0, rows: 0 });
assert.deepEqual(tileRect(g, 1, 0), { x: 19, y: 1, w: 16, h: 16 });

// clicks: inside a tile, in the gap, in the margin, past the end
assert.equal(tileAt(1, 1, g, 2, 1), 0);
assert.equal(tileAt(19, 5, g, 2, 1), 1);
assert.equal(tileAt(17, 5, g, 2, 1), null); // gap between the tiles
assert.equal(tileAt(0, 5, g, 2, 1), null); // margin
assert.equal(tileAt(5, 30, g, 2, 1), null); // below the last row

// numbering goes row by row
const g4: Grid = { tileW: 4, tileH: 4, margin: 0, spacing: 0 };
assert.equal(tileAt(5, 5, g4, 3, 3), 4);

// empty detection
const img = blank(8, 4);
setPixel(img, 6, 1, [10, 10, 10, 255]);
assert.equal(isEmptyTile(img, tileRect(g4, 0, 0)), true);
assert.equal(isEmptyTile(img, tileRect(g4, 1, 0)), false);

// a tileset built by buildSheet with the same margin/spacing is read back by the same grid
const tiles = [blank(16, 16), blank(16, 16), blank(16, 16)];
const sheet = buildSheet(tiles, { columns: 2, spacing: 2, padding: 1, align: "top-left" });
assert.deepEqual(gridSize(sheet.img.w, sheet.img.h, g), { cols: 2, rows: 2 });
assert.deepEqual(tileRect(g, 0, 1), sheet.cells[2]);

console.log("tiles ok");

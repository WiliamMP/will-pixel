/// <reference types="node" />
// Self-check of the playback order: npm run check
import assert from "node:assert/strict";
import { animFrame } from "./anim.ts";

const seq = (n: number, mode: "loop" | "once" | "pingpong") => Array.from({ length: 8 }, (_, t) => animFrame(t, n, mode));

assert.deepEqual(seq(3, "loop"), [0, 1, 2, 0, 1, 2, 0, 1]);
assert.deepEqual(seq(3, "once"), [0, 1, 2, 2, 2, 2, 2, 2]);
assert.deepEqual(seq(3, "pingpong"), [0, 1, 2, 1, 0, 1, 2, 1]);
assert.deepEqual(seq(2, "pingpong"), [0, 1, 0, 1, 0, 1, 0, 1]);
// a single frame never moves, whatever the mode
for (const mode of ["loop", "once", "pingpong"] as const) assert.deepEqual(seq(1, mode), [0, 0, 0, 0, 0, 0, 0, 0]);

console.log("anim ok");

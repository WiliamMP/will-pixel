// Which frame the preview shows at each tick of the playback clock. No DOM.

/** loop = 0 1 2 0 1 2..., once = 0 1 2 and stop, pingpong = 0 1 2 1 0 1 2... */
export type LoopMode = "loop" | "once" | "pingpong";

/** Frame index for tick t (0, 1, 2...) of an animation with n frames */
export function animFrame(t: number, n: number, mode: LoopMode): number {
  if (n <= 1) return 0;
  if (mode === "once") return Math.min(t, n - 1);
  if (mode === "pingpong") {
    const pos = t % (2 * n - 2);
    return pos < n ? pos : 2 * n - 2 - pos;
  }
  return t % n;
}

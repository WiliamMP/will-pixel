import { useLayoutEffect, useRef } from "react";
import type { Img } from "@/lib/pixels";
import { toImageData } from "@/lib/png";

const CHECKER = "repeating-conic-gradient(#7d8294 0 25%, #9aa0b3 0 50%) 0 0 / 8px 8px";

/** Small picture of an image, fitted in a `size` px box.
 *  `version` repaints it when the same Img object was drawn on. */
export function Thumb({ img, size = 24, version }: { img: Img; size?: number; version?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => ref.current?.getContext("2d")!.putImageData(toImageData(img), 0, 0), [img, version]);
  // whole-number zoom for small images, shrink to fit for big ones
  const side = Math.max(img.w, img.h);
  const s = side <= size ? Math.floor(size / side) : size / side;
  return (
    <canvas
      ref={ref}
      width={img.w}
      height={img.h}
      className="shrink-0 [image-rendering:pixelated]"
      style={{ width: img.w * s, height: img.h * s, background: CHECKER }}
    />
  );
}

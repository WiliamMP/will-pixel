import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Circle, Triangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hexToRgb, hsvToRgb, isHex, rgbToHex, rgbToHsv, type HSV } from "@/lib/color";

type Mode = "circle" | "triangle";
type Pt = [number, number];

const MODE_KEY = "will-pixel.picker";
const SIZE = 192;
const C = SIZE / 2;
const R = C - 2;
// Triangle mode: hue ring between RING and R, triangle inside it
const RING = R * 0.8;
const TRI = RING - 6;
const vertex = (deg: number): Pt => [C + TRI * Math.cos((deg * Math.PI) / 180), C - TRI * Math.sin((deg * Math.PI) / 180)];
// Fixed triangle: pure hue on top, white bottom left, black bottom right
const [A, B, K] = [vertex(90), vertex(210), vertex(330)];

/** Hue (degrees) of a point, 0 = right, counterclockwise */
const hueAt = (x: number, y: number) => ((Math.atan2(C - y, x - C) * 180) / Math.PI + 360) % 360;

/** Barycentric weights of the hue, white and black corners for a point. Some are negative outside the triangle. */
function rawWeights(x: number, y: number): [number, number, number] {
  const det = (B[1] - K[1]) * (A[0] - K[0]) + (K[0] - B[0]) * (A[1] - K[1]);
  const a = ((B[1] - K[1]) * (x - K[0]) + (K[0] - B[0]) * (y - K[1])) / det;
  const b = ((K[1] - A[1]) * (x - K[0]) + (A[0] - K[0]) * (y - K[1])) / det;
  return [a, b, 1 - a - b];
}

/** Same weights, clamped so a point dragged outside sticks to the nearest edge */
function weights(x: number, y: number): [number, number, number] {
  const w = rawWeights(x, y).map((n) => Math.max(0, n));
  const sum = w[0] + w[1] + w[2];
  return [w[0] / sum, w[1] / sum, w[2] / sum];
}

/** Draws the circle (or ring + triangle) pixel by pixel at screen resolution, then the markers */
function paint(canvas: HTMLCanvasElement, mode: Mode, [h, s, v]: HSV) {
  const dpr = devicePixelRatio || 1;
  const n = Math.round(SIZE * dpr);
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(n, n);
  const hue = hsvToRgb(h, 1, 1);
  for (let py = 0; py < n; py++)
    for (let px = 0; px < n; px++) {
      const x = (px + 0.5) / dpr;
      const y = (py + 0.5) / dpr;
      const d = Math.hypot(x - C, y - C);
      let rgb: number[] | null = null;
      let alpha = Math.min(1, Math.max(0, R - d + 0.5));
      if (mode === "circle") {
        if (d <= R + 0.5) rgb = hsvToRgb(hueAt(x, y), Math.min(1, d / R), v);
      } else if (d >= RING - 0.5 && d <= R + 0.5) {
        rgb = hsvToRgb(hueAt(x, y), 1, 1);
        alpha = Math.min(alpha, d - RING + 0.5);
      } else if (d < RING) {
        const [a, b, k] = rawWeights(x, y);
        if (a >= 0 && b >= 0 && k >= 0) {
          rgb = hue.map((c) => a * c + b * 255);
          alpha = 1;
        }
      }
      if (!rgb) continue;
      const i = (py * n + px) * 4;
      img.data.set([rgb[0], rgb[1], rgb[2], alpha * 255], i);
    }
  ctx.putImageData(img, 0, 0);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const marker = ([x, y]: Pt, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgb(0 0 0 / 0.6)";
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  };
  const rad = (h * Math.PI) / 180;
  if (mode === "circle") marker([C + Math.cos(rad) * s * R, C - Math.sin(rad) * s * R], 5);
  else {
    const mid = (RING + R) / 2;
    marker([C + Math.cos(rad) * mid, C - Math.sin(rad) * mid], 5);
    const [a, b, k] = [s * v, v * (1 - s), 1 - v];
    marker([a * A[0] + b * B[0] + k * K[0], a * A[1] + b * B[1] + k * K[1]], 5);
  }
}

/** HSV color picker: a circle (hue around, saturation outward, value slider) or a hue ring with a triangle */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) === "triangle" ? "triangle" : "circle"));
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(value)));
  const [text, setText] = useState(value);
  const canvas = useRef<HTMLCanvasElement>(null);
  // What the current drag moves: the disk, the hue ring or the triangle
  const target = useRef<"disk" | "ring" | "tri" | null>(null);

  // Follow outside changes (palette, eyedropper). Grays and black have no hue: keep the old one.
  useEffect(() => {
    setText(value);
    setHsv((cur) => {
      if (rgbToHex(hsvToRgb(...cur)) === value) return cur;
      const [h, s, v] = rgbToHsv(hexToRgb(value));
      return v === 0 ? [cur[0], cur[1], 0] : s === 0 ? [cur[0], 0, v] : [h, s, v];
    });
  }, [value]);

  useLayoutEffect(() => paint(canvas.current!, mode, hsv), [mode, hsv]);

  function set(next: HSV) {
    setHsv(next);
    onChange(rgbToHex(hsvToRgb(...next)));
  }

  function switchMode(m: Mode) {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  }

  function pick(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const t = target.current;
    if (t === "disk") set([hueAt(x, y), Math.min(1, Math.hypot(x - C, y - C) / R), hsv[2]]);
    else if (t === "ring") set([hueAt(x, y), hsv[1], hsv[2]]);
    else if (t === "tri") {
      const [a, b] = weights(x, y);
      const v = a + b;
      set([hsv[0], v ? a / v : hsv[1], v]);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const d = Math.hypot(e.clientX - r.left - C, e.clientY - r.top - C);
    target.current = mode === "circle" ? "disk" : d >= RING - 4 ? "ring" : "tri";
    e.currentTarget.setPointerCapture(e.pointerId);
    pick(e);
  }

  const modes: { id: Mode; label: string; icon: typeof Circle }[] = [
    { id: "circle", label: "Círculo de cores", icon: Circle },
    { id: "triangle", label: "Triângulo de cores", icon: Triangle },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="size-7 shrink-0 rounded-md border border-black/30" style={{ background: value }} />
        <input
          aria-label="Cor em hexadecimal"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (isHex(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          className="h-7 w-0 flex-1 rounded-md border bg-background px-2 font-mono text-sm"
        />
        {modes.map((m) => (
          <Button
            key={m.id}
            variant={mode === m.id ? "secondary" : "ghost"}
            size="icon-sm"
            title={m.label}
            aria-label={m.label}
            aria-pressed={mode === m.id}
            onClick={() => switchMode(m.id)}
          >
            <m.icon />
          </Button>
        ))}
      </div>
      <canvas
        ref={canvas}
        className="mx-auto cursor-crosshair touch-none"
        style={{ width: SIZE, height: SIZE }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => target.current && pick(e)}
        onPointerUp={() => (target.current = null)}
        onPointerCancel={() => (target.current = null)}
      />
      {mode === "circle" && (
        <input
          type="range"
          aria-label="Brilho"
          title="Brilho"
          min={0}
          max={1000}
          value={Math.round(hsv[2] * 1000)}
          onChange={(e) => set([hsv[0], hsv[1], Number(e.target.value) / 1000])}
          className="h-3 w-full cursor-pointer appearance-none rounded-full"
          style={{ background: `linear-gradient(to right, #000, ${rgbToHex(hsvToRgb(hsv[0], hsv[1], 1))})` }}
        />
      )}
    </div>
  );
}

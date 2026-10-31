import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import {
  Brush,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Grid3x3,
  Move,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  Save,
  SquareDashed,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { WindowControls, dragWindow } from "@/components/WindowControls";
import { splashDone } from "@/lib/splash";
import { cn } from "@/lib/utils";
import {
  CLEAR,
  blank,
  clampRect,
  clearRect,
  clone,
  fill,
  flip,
  full,
  getPixel,
  hexToRgba,
  inside,
  line,
  moveRect,
  rectBetween,
  rgbaToHex,
  setPixel,
  type Img,
  type Rect,
  type RGBA,
} from "@/lib/pixels";

type Tool = "pencil" | "eraser" | "fill" | "picker" | "select" | "move";

const TOOLS: { id: Tool; key: string; label: string; icon: LucideIcon }[] = [
  { id: "pencil", key: "b", label: "Lápis", icon: Pencil },
  { id: "eraser", key: "e", label: "Borracha", icon: Eraser },
  { id: "fill", key: "g", label: "Balde", icon: PaintBucket },
  { id: "picker", key: "i", label: "Conta-gotas", icon: Pipette },
  { id: "select", key: "m", label: "Seleção · Esc desmarca, Del apaga", icon: SquareDashed },
  { id: "move", key: "v", label: "Mover a seleção ou tudo · setas movem 1px", icon: Move },
];
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const SIZES = [8, 16, 32, 64];
// Starting palette: the colors of the first sprites (Sword1, Sword2, Character_Base)
const DEFAULT_PALETTE = [
  "#1a1626", "#5a5a6a", "#9a9aae", "#ffffff",
  "#c8902a", "#f0c850", "#8a5a2b", "#5c3a1e",
  "#8a2020", "#c03838", "#e86060", "#ffd2b4",
  "#c5987a", "#262b44", "#3a4466", "#60a4ff",
];
const PALETTE_KEY = "will-pixel.palette";
const HISTORY_MAX = 100;
// ponytail: whole-image snapshots per stroke and a full redraw per change, fine up to 256x256
const MAX_SIDE = 256;
const PNG = [{ name: "PNG", extensions: ["png"] }];
// One checker cell per sprite pixel, so transparent areas still show the pixel size
const CHECKER = "repeating-conic-gradient(#7d8294 0 25%, #9aa0b3 0 50%)";

function loadPalette(): string[] {
  try {
    const p = JSON.parse(localStorage.getItem(PALETTE_KEY) ?? "null");
    return Array.isArray(p) ? p : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

/** Zoom that makes the image about 480px on screen */
const fitZoom = (img: Img) => Math.max(1, Math.floor(480 / Math.max(img.w, img.h)));

const toImageData = (img: Img) => new ImageData(img.data, img.w, img.h);

async function encodePng(img: Img): Promise<number[]> {
  const c = document.createElement("canvas");
  c.width = img.w;
  c.height = img.h;
  c.getContext("2d")!.putImageData(toImageData(img), 0, 0);
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar o PNG"))), "image/png"),
  );
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

async function decodePng(bytes: number[]): Promise<Img> {
  const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)]), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  if (bmp.width > MAX_SIDE || bmp.height > MAX_SIDE)
    throw new Error(`Imagem grande demais (${bmp.width}x${bmp.height}). Máximo ${MAX_SIDE}x${MAX_SIDE}.`);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
}

export default function App() {
  const img = useRef<Img>(blank(16, 16));
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [zoom, setZoom] = useState(() => fitZoom(img.current));
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState(DEFAULT_PALETTE[0]);
  const [palette, setPalette] = useState(loadPalette);
  const [grid, setGrid] = useState(true);
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cursor, setCursor] = useState("");
  const [sel, setSel] = useState<Rect | null>(null);
  const past = useRef<Img[]>([]);
  const future = useRef<Img[]>([]);
  // The stroke in progress: last pixel painted and its color
  const stroke = useRef<{ x: number; y: number; c: RGBA } | null>(null);
  // The move in progress: image before the drag, the area being moved and the pixel where it started.
  // Moving from `base` each time means pixels dragged off the edge come back if dragged back.
  // ponytail: the piece is pasted on release, so moving it again also lifts what was under it;
  // a floating selection (Aseprite style) if that gets in the way
  const drag = useRef<{ base: Img; rect: Rect; x: number; y: number } | null>(null);
  // The selection being drawn: the pixel where it started and whether the mouse left it
  const selecting = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const previewBig = useRef<HTMLCanvasElement>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Repaint after every render: a sprite is a few KB, cheaper than tracking what changed
  useLayoutEffect(() => {
    const data = toImageData(img.current);
    for (const c of [canvas.current, preview.current, previewBig.current]) c?.getContext("2d")!.putImageData(data, 0, 0);
  });

  function checkpoint() {
    past.current.push(clone(img.current));
    if (past.current.length > HISTORY_MAX) past.current.shift();
    future.current = [];
    setDirty(true);
  }

  function step(from: Img[], to: Img[]) {
    const prev = from.pop();
    if (!prev) return;
    to.push(img.current);
    if (prev.w !== img.current.w || prev.h !== img.current.h) setZoom(fitZoom(prev));
    img.current = prev;
    setDirty(true);
    redraw();
  }
  const undo = () => step(past.current, future.current);
  /** What move, flip and delete act on: the selection, or the whole image when nothing is selected */
  const area = () => (sel && clampRect(sel, img.current)) ?? full(img.current);
  const redo = () => step(future.current, past.current);

  function pixelAt(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.floor(((e.clientX - r.left) / r.width) * img.current.w),
      Math.floor(((e.clientY - r.top) / r.height) * img.current.h),
    ];
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0 && e.button !== 2) return;
    const [x, y] = pixelAt(e);
    if (!inside(img.current, x, y)) return;
    // Right button always erases, like the secondary color in Aseprite
    const t = e.button === 2 ? "eraser" : tool;
    if (t === "picker") {
      const p = getPixel(img.current, x, y);
      if (p[3] > 0) {
        setColor(rgbaToHex(p));
        setTool("pencil");
      }
      return;
    }
    if (t === "select") {
      selecting.current = { x, y, moved: false };
      setSel(rectBetween(x, y, x, y));
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    checkpoint();
    if (t === "move") {
      drag.current = { base: img.current, rect: area(), x, y };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const c = t === "eraser" ? CLEAR : hexToRgba(color);
    if (t === "fill") fill(img.current, x, y, c);
    else {
      setPixel(img.current, x, y, c);
      stroke.current = { x, y, c };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    redraw();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const [x, y] = pixelAt(e);
    setCursor(inside(img.current, x, y) ? `${x}, ${y}` : "");
    const s0 = selecting.current;
    if (s0) {
      const { w, h } = img.current;
      const cx = Math.min(w - 1, Math.max(0, x));
      const cy = Math.min(h - 1, Math.max(0, y));
      s0.moved ||= cx !== s0.x || cy !== s0.y;
      setSel(rectBetween(s0.x, s0.y, cx, cy));
      return;
    }
    const d = drag.current;
    if (d) {
      img.current = moveRect(d.base, d.rect, x - d.x, y - d.y);
      if (sel) setSel({ ...d.rect, x: d.rect.x + x - d.x, y: d.rect.y + y - d.y });
      else redraw();
      return;
    }
    const s = stroke.current;
    if (!s || (s.x === x && s.y === y)) return;
    for (const [px, py] of line(s.x, s.y, x, y)) setPixel(img.current, px, py, s.c);
    s.x = x;
    s.y = y;
    redraw();
  }

  const endStroke = () => {
    // A click without dragging clears the selection
    if (selecting.current && !selecting.current.moved) setSel(null);
    if (drag.current) setSel((s) => s && clampRect(s, img.current));
    stroke.current = null;
    drag.current = null;
    selecting.current = null;
  };

  function flipArea(horizontal: boolean) {
    checkpoint();
    flip(img.current, area(), horizontal);
    redraw();
  }

  async function confirmDiscard() {
    return !dirtyRef.current || ask("Descartar as alterações não salvas?", { title: "will-pixel", kind: "warning" });
  }

  function load(next: Img, p: string | null) {
    past.current = [];
    future.current = [];
    img.current = next;
    setSel(null);
    setZoom(fitZoom(next));
    setPath(p);
    setDirty(false);
    redraw();
  }

  async function newImage(size: number) {
    if (await confirmDiscard()) load(blank(size, size), null);
  }

  async function openFile() {
    if (!(await confirmDiscard())) return;
    const p = await open({ filters: PNG, defaultPath: path ?? undefined });
    if (typeof p !== "string") return;
    try {
      load(await decodePng(await invoke<number[]>("read_file", { path: p })), p);
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function saveFile(as: boolean) {
    let p = as ? null : path;
    if (!p) {
      p = await save({ filters: PNG, defaultPath: path ?? "sprite.png" });
      if (!p) return;
      if (!/\.png$/i.test(p)) p += ".png";
    }
    try {
      await invoke("write_file", { path: p, bytes: await encodePng(img.current) });
      setPath(p);
      setDirty(false);
      toast.success(`Salvo em ${p}`);
    } catch (err) {
      toast.error(String(err));
    }
  }

  function updatePalette(next: string[]) {
    setPalette(next);
    try {
      localStorage.setItem(PALETTE_KEY, JSON.stringify(next));
    } catch {}
  }

  function pickColor(hex: string) {
    setColor(hex);
    if (tool === "eraser" || tool === "picker") setTool("pencil");
  }

  // Shortcuts read the latest state through this ref, the listener is added once
  const onKey = useRef<(e: KeyboardEvent) => void>(null);
  onKey.current = (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      const actions: Record<string, () => void> = {
        z: e.shiftKey ? redo : undo,
        y: redo,
        s: () => saveFile(e.shiftKey),
        o: openFile,
        a: () => setSel(full(img.current)),
        d: () => setSel(null),
      };
      if (actions[k]) {
        e.preventDefault();
        actions[k]();
      }
      return;
    }
    const arrow = ARROWS[e.key];
    if (arrow && tool === "move") {
      e.preventDefault();
      checkpoint();
      const r = area();
      img.current = moveRect(img.current, r, ...arrow);
      if (sel) setSel(clampRect({ ...r, x: r.x + arrow[0], y: r.y + arrow[1] }, img.current));
      redraw();
      return;
    }
    if (e.key === "Escape") return setSel(null);
    if (e.key === "Delete" || e.key === "Backspace") {
      checkpoint();
      clearRect(img.current, area());
      return redraw();
    }
    if (e.shiftKey && (k === "h" || k === "v")) return flipArea(k === "h");
    const t = TOOLS.find((t) => t.key === k);
    if (t) setTool(t.id);
  };

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => onKey.current?.(e);
    addEventListener("keydown", keydown);
    // Close button and Alt+F4 both pass here
    const off = getCurrentWindow().onCloseRequested(async (e) => {
      if (!(await confirmDiscard())) e.preventDefault();
    });
    splashDone();
    return () => {
      removeEventListener("keydown", keydown);
      off.then((f) => f());
    };
  }, []);

  const { w, h } = img.current;
  const name = path ? path.split(/[\\/]/).pop() : "sem título";
  const bigScale = Math.max(2, Math.floor(128 / Math.max(w, h)));

  return (
    <div className="flex h-full flex-col">
      <header onMouseDown={dragWindow} className="flex h-9 shrink-0 items-center gap-1 border-b pl-3">
        <Brush className="pointer-events-none size-4 text-primary" />
        <span className="pointer-events-none font-medium">will-pixel</span>
        <span className="pointer-events-none ml-2 flex-1 truncate text-muted-foreground">
          {name}
          {dirty && " •"}
        </span>
        <select
          aria-label="Novo"
          title="Novo desenho"
          className="h-7 rounded-md border bg-background px-2 text-sm"
          value=""
          onChange={(e) => newImage(Number(e.target.value))}
        >
          <option value="" disabled hidden>
            Novo…
          </option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}x{s}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" title="Abrir (Ctrl+O)" onClick={openFile}>
          <FolderOpen />
          Abrir
        </Button>
        <Button variant="ghost" size="sm" title="Salvar (Ctrl+S) · Salvar como (Ctrl+Shift+S)" onClick={() => saveFile(false)}>
          <Save />
          Salvar
        </Button>
        <WindowControls />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2">
          {TOOLS.map((t) => (
            <ToolButton
              key={t.id}
              label={`${t.label} (${t.key.toUpperCase()})`}
              active={tool === t.id}
              onClick={() => setTool(t.id)}
            >
              <t.icon />
            </ToolButton>
          ))}
          <div className="my-1 h-px w-6 bg-border" />
          <ToolButton label="Espelhar na horizontal (Shift+H)" onClick={() => flipArea(true)}>
            {/* lucide 1.x draws flip-vertical-2 around a vertical axis, which is the left/right mirror */}
            <FlipVertical2 />
          </ToolButton>
          <ToolButton label="Espelhar na vertical (Shift+V)" onClick={() => flipArea(false)}>
            <FlipHorizontal2 />
          </ToolButton>
          <div className="my-1 h-px w-6 bg-border" />
          <ToolButton label="Desfazer (Ctrl+Z)" onClick={undo}>
            <Undo2 />
          </ToolButton>
          <ToolButton label="Refazer (Ctrl+Y)" onClick={redo}>
            <Redo2 />
          </ToolButton>
          <ToolButton label="Grade" active={grid} onClick={() => setGrid((g) => !g)}>
            <Grid3x3 />
          </ToolButton>
        </aside>

        <main
          className="flex min-w-0 flex-1 overflow-auto bg-muted/40 p-6"
          onWheel={(e) => {
            const d = Math.max(1, Math.round(zoom / 8)) * (e.deltaY < 0 ? 1 : -1);
            setZoom(Math.min(64, Math.max(1, zoom + d)));
          }}
        >
          <div
            className="relative m-auto shrink-0 shadow-lg"
            style={{ width: w * zoom, height: h * zoom, background: CHECKER, backgroundSize: `${zoom * 2}px ${zoom * 2}px` }}
          >
            <canvas
              ref={canvas}
              width={w}
              height={h}
              className={cn(
                "absolute inset-0 size-full [image-rendering:pixelated]",
                tool === "move" ? "cursor-move" : "cursor-crosshair",
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onPointerLeave={() => setCursor("")}
              onContextMenu={(e) => e.preventDefault()}
            />
            {grid && zoom >= 6 && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgb(0 0 0 / 0.22) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 0 0 / 0.22) 1px, transparent 1px)",
                  backgroundSize: `${zoom}px ${zoom}px`,
                }}
              />
            )}
            {sel && (
              <div
                className="pointer-events-none absolute border border-dashed border-white outline outline-black/70"
                style={{ left: sel.x * zoom, top: sel.y * zoom, width: sel.w * zoom, height: sel.h * zoom }}
              />
            )}
          </div>
        </main>

        <aside className="flex w-56 shrink-0 flex-col gap-5 overflow-y-auto border-l p-3">
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">Prévia</h2>
            {/* Blue-gray background: shows if the sprite still reads at real size */}
            <div className="flex items-end gap-3 rounded-md bg-[#78a0c8] p-3">
              <canvas ref={preview} width={w} height={h} className="[image-rendering:pixelated]" />
              <canvas
                ref={previewBig}
                width={w}
                height={h}
                className="[image-rendering:pixelated]"
                style={{ width: w * bigScale, height: h * bigScale }}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">Cor</h2>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Escolher cor"
                value={color}
                onChange={(e) => pickColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border bg-transparent"
              />
              <span className="flex-1 font-mono text-sm">{color}</span>
              <Button
                variant="outline"
                size="icon-sm"
                title="Adicionar à paleta"
                aria-label="Adicionar à paleta"
                disabled={palette.includes(color)}
                onClick={() => updatePalette([...palette, color])}
              >
                <Plus />
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">Paleta</h2>
            <div className="grid grid-cols-8 gap-1">
              {palette.map((hex) => (
                <button
                  key={hex}
                  title={`${hex} · botão direito remove`}
                  aria-label={hex}
                  className={cn(
                    "aspect-square rounded-sm border border-black/30",
                    hex === color && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                  )}
                  style={{ background: hex }}
                  onClick={() => pickColor(hex)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    updatePalette(palette.filter((c) => c !== hex));
                  }}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Botão direito no desenho apaga.</p>
          </section>
        </aside>
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-3 border-t px-3 font-mono text-xs text-muted-foreground">
        <span>
          {w}x{h}
        </span>
        <span>{zoom}x</span>
        <span>{cursor}</span>
        {sel && (
          <span>
            seleção {sel.w}x{sel.h}
          </span>
        )}
      </footer>
      <Toaster position="bottom-center" richColors />
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(active && "shadow-[0_0_16px_var(--glow)]")}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

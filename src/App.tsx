import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
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
  Images,
  Grid2x2,
  LayoutGrid,
  LoaderPinwheel,
  Move,
  Pause,
  Play,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Save,
  SquareSplitHorizontal,
  SquareSplitVertical,
  StepBack,
  StepForward,
  SquareDashed,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ColorPicker } from "@/components/ColorPicker";
import { PalettePanel } from "@/components/PalettePanel";
import { SpriteSheetDialog } from "@/components/SpriteSheetDialog";
import { ONION_NEXT, ONION_PREV, Timeline } from "@/components/Timeline";
import { animFrame, type LoopMode } from "@/lib/anim";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { WindowControls, dragWindow } from "@/components/WindowControls";
import { seams } from "@/lib/color";
import { PNG_FILTER, decodePng, encodePng, toImageData } from "@/lib/png";
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
  mirrorPoints,
  moveRect,
  rectBetween,
  rgbaToHex,
  setPixel,
  type Img,
  type Rect,
  type RGBA,
  type Symmetry,
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

// The symmetry button cycles through these, in this order
const SYMMETRIES: { id: Symmetry; label: string; icon: LucideIcon }[] = [
  { id: "off", label: "Simetria desligada", icon: SquareSplitHorizontal },
  { id: "h", label: "Simetria esquerda e direita", icon: SquareSplitHorizontal },
  { id: "v", label: "Simetria cima e baixo", icon: SquareSplitVertical },
  { id: "both", label: "Simetria nos 4 lados", icon: Grid2x2 },
  { id: "radial", label: "Simetria radial (4 giros de 90°)", icon: LoaderPinwheel },
];

const LOOPS: { id: LoopMode; label: string }[] = [
  { id: "loop", label: "Repetir" },
  { id: "pingpong", label: "Vai e volta" },
  { id: "once", label: "Uma vez" },
];

const SIZES = [8, 16, 32, 64];
const HISTORY_MAX = 100;
// ponytail: whole-image snapshots per stroke and a full redraw per change, fine up to 256x256
const MAX_SIDE = 256;
// One checker cell per sprite pixel, so transparent areas still show the pixel size
const CHECKER = "repeating-conic-gradient(#7d8294 0 25%, #9aa0b3 0 50%)";

/** One undo step: the frame it belongs to and its image before the change */
type Step = { frame: number; img: Img };

/** Draws a frame tinted with one color, for the onion skin */
function paintOnion(c: HTMLCanvasElement, f: Img, tint: string) {
  const ctx = c.getContext("2d")!;
  ctx.putImageData(toImageData(f), 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "source-over";
}

/** Zoom that makes the image about 480px on screen */
const fitZoom = (img: Img) => Math.max(1, Math.floor(480 / Math.max(img.w, img.h)));

export default function App() {
  const img = useRef<Img>(blank(16, 16));
  const [version, redraw] = useReducer((n: number) => n + 1, 0);
  // Animation frames, all the same size. img.current is always frames.current[frameRef.current].
  const frames = useRef<Img[]>([img.current]);
  const frameRef = useRef(0);
  const [frame, setFrame] = useState(0);
  const [onion, setOnion] = useState(false);
  const [onionRange, setOnionRange] = useState(1);
  const onionCanvases = useRef(new Map<number, HTMLCanvasElement>());
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(8);
  const [loop, setLoop] = useState<LoopMode>("loop");
  // Playback clock: ticks since play started; animFrame turns it into a frame index
  const [playT, setPlayT] = useState(0);
  const playedFrame = animFrame(playT, frames.current.length, loop);
  const [zoom, setZoom] = useState(() => fitZoom(img.current));
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#1a1626");
  const [grid, setGrid] = useState(true);
  // Texture mode: the drawing repeated 3x3 around the editable center, seams marked
  const [tile, setTile] = useState(false);
  const tiles = useRef<(HTMLCanvasElement | null)[]>([]);
  const [symmetry, setSymmetry] = useState<Symmetry>("off");
  const [sheetOpen, setSheetOpen] = useState(false);
  const sym = SYMMETRIES.find((m) => m.id === symmetry)!;
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cursor, setCursor] = useState("");
  const [sel, setSel] = useState<Rect | null>(null);
  const past = useRef<Step[]>([]);
  const future = useRef<Step[]>([]);
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
    for (const c of [canvas.current, ...tiles.current]) c?.getContext("2d")!.putImageData(data, 0, 0);
    // While playing, the preview cycles through the frames
    const shown = playing ? frames.current[playedFrame] : img.current;
    for (const c of [preview.current, previewBig.current]) c?.getContext("2d")!.putImageData(toImageData(shown), 0, 0);
    for (const [offset, c] of onionCanvases.current) {
      const f = frames.current[frameRef.current + offset];
      if (f) paintOnion(c, f, offset < 0 ? ONION_PREV : ONION_NEXT);
    }
  });

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPlayT((t) => t + 1), 1000 / fps);
    return () => clearInterval(id);
  }, [playing, fps]);

  // "Uma vez" stops on the last frame
  useEffect(() => {
    if (playing && loop === "once" && playT >= frames.current.length - 1) pause();
  }, [playing, loop, playT]);

  /** Stops on the frame the preview was showing, so the editor lands there */
  function pause() {
    setPlaying(false);
    showFrame(playedFrame);
  }

  function togglePlay() {
    if (playing) return pause();
    const n = frames.current.length;
    // start from the frame being edited; "Uma vez" already at the end starts over
    setPlayT(loop === "once" && frameRef.current === n - 1 ? 0 : frameRef.current);
    setPlaying(true);
  }

  /** Replaces the image of the current frame */
  function setImg(next: Img) {
    img.current = next;
    frames.current[frameRef.current] = next;
  }

  function showFrame(i: number) {
    frameRef.current = i;
    img.current = frames.current[i];
    setFrame(i);
    redraw();
  }

  function checkpoint() {
    past.current.push({ frame: frameRef.current, img: clone(img.current) });
    if (past.current.length > HISTORY_MAX) past.current.shift();
    future.current = [];
    setDirty(true);
  }

  // Undo jumps to the frame the step belongs to
  function step(from: Step[], to: Step[]) {
    const prev = from.pop();
    if (!prev) return;
    to.push({ frame: prev.frame, img: frames.current[prev.frame] });
    frames.current[prev.frame] = prev.img;
    showFrame(prev.frame);
    setDirty(true);
  }

  // ponytail: adding or deleting a frame clears the undo history, because its steps point at frame numbers;
  // keep a history per frame if that gets in the way
  function addFrame(copy: boolean) {
    const at = frameRef.current + 1;
    frames.current.splice(at, 0, copy ? clone(img.current) : blank(img.current.w, img.current.h));
    past.current = [];
    future.current = [];
    setDirty(true);
    showFrame(at);
  }

  async function deleteFrame() {
    if (frames.current.length === 1) return;
    const empty = img.current.data.every((v) => v === 0);
    if (!empty && !(await ask("Excluir este frame? Não dá para desfazer.", { title: "will-pixel", kind: "warning" }))) return;
    frames.current.splice(frameRef.current, 1);
    past.current = [];
    future.current = [];
    setDirty(true);
    showFrame(Math.min(frameRef.current, frames.current.length - 1));
  }

  /** Frame by frame: pauses first, then moves one frame (wrapping around) */
  function stepFrame(d: number) {
    if (playing) pause();
    showFrame((frameRef.current + d + frames.current.length) % frames.current.length);
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

  const mirrored = (x: number, y: number) => mirrorPoints(x, y, img.current.w, img.current.h, symmetry);

  /** Pencil and eraser: one pixel plus its symmetric copies */
  function paint(x: number, y: number, c: RGBA) {
    for (const [px, py] of mirrored(x, y)) setPixel(img.current, px, py, c);
  }

  function cycleSymmetry() {
    const i = SYMMETRIES.findIndex((m) => m.id === symmetry);
    setSymmetry(SYMMETRIES[(i + 1) % SYMMETRIES.length].id);
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
    if (t === "fill") for (const [px, py] of mirrored(x, y)) fill(img.current, px, py, c);
    else {
      paint(x, y, c);
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
      setImg(moveRect(d.base, d.rect, x - d.x, y - d.y));
      if (sel) setSel({ ...d.rect, x: d.rect.x + x - d.x, y: d.rect.y + y - d.y });
      else redraw();
      return;
    }
    const s = stroke.current;
    if (!s || (s.x === x && s.y === y)) return;
    for (const [px, py] of line(s.x, s.y, x, y)) paint(px, py, s.c);
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

  // `version` changes whenever the image does
  const report = useMemo(() => (tile ? seams(img.current) : null), [tile, version]);

  function toggleTile() {
    const on = !tile;
    setTile(on);
    // 3x3 copies: shrink the zoom so the whole block fits where the single image did
    setZoom(Math.max(1, Math.floor(fitZoom(img.current) / (on ? 3 : 1))));
  }

  function load(next: Img, p: string | null) {
    past.current = [];
    future.current = [];
    frames.current = [next];
    frameRef.current = 0;
    img.current = next;
    setFrame(0);
    setPlaying(false);
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
    const p = await open({ filters: PNG_FILTER, defaultPath: path ?? undefined });
    if (typeof p !== "string") return;
    try {
      load(await decodePng(await invoke<number[]>("read_file", { path: p }), MAX_SIDE), p);
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function saveFile(as: boolean) {
    let p = as ? null : path;
    if (!p) {
      p = await save({ filters: PNG_FILTER, defaultPath: path ?? "sprite.png" });
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

  function applyImage(next: Img) {
    checkpoint();
    setImg(next);
    redraw();
  }

  function pickColor(hex: string) {
    setColor(hex);
    if (tool === "eraser" || tool === "picker") setTool("pencil");
  }

  // Shortcuts read the latest state through this ref, the listener is added once
  const onKey = useRef<(e: KeyboardEvent) => void>(null);
  onKey.current = (e) => {
    // The sprite sheet dialog is on top: only Esc (close) goes through, so Delete/Ctrl+Z don't touch the drawing
    if (sheetOpen) return e.key === "Escape" && setSheetOpen(false);
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
      setImg(moveRect(img.current, r, ...arrow));
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
    if (k === "t") return toggleTile();
    if (k === "o") return setOnion((o) => !o);
    if (k === ",") return stepFrame(-1);
    if (k === ".") return stepFrame(1);
    if (e.key === "Enter") return togglePlay();
    if (k === "s") return cycleSymmetry();
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
  // Neighbor frames that exist, nearest first: -1, 1, -2, 2...
  const onionOffsets = Array.from({ length: onionRange }, (_, i) => [-(i + 1), i + 1])
    .flat()
    .filter((o) => frames.current[frame + o]);
  /** One of the 8 repeated copies around the center in texture mode, repainted with the others.
   *  A plain function, not a component: the canvases keep their identity between renders. */
  const tileCopy = (index: number) => (
    <canvas
      key={index}
      ref={(c) => {
        tiles.current[index] = c;
      }}
      width={w}
      height={h}
      className="[image-rendering:pixelated]"
      style={{ width: w * zoom, height: h * zoom, background: CHECKER, backgroundSize: `${zoom * 2}px ${zoom * 2}px` }}
    />
  );
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
        <Button variant="ghost" size="sm" title="Juntar vários sprites numa spritesheet" onClick={() => setSheetOpen(true)}>
          <Images />
          Spritesheet
        </Button>
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
          <ToolButton label="Modo textura: repete 3x3 e marca as emendas (T)" active={tile} onClick={toggleTile}>
            <LayoutGrid />
          </ToolButton>
          <ToolButton label={`${sym.label} · clique troca (S)`} active={symmetry !== "off"} onClick={cycleSymmetry}>
            <sym.icon />
          </ToolButton>
        </aside>

        <main
          className="flex min-w-0 flex-1 overflow-auto bg-muted/40 p-6"
          onWheel={(e) => {
            const d = Math.max(1, Math.round(zoom / 8)) * (e.deltaY < 0 ? 1 : -1);
            setZoom(Math.min(64, Math.max(1, zoom + d)));
          }}
        >
          <div className={cn("m-auto shrink-0", tile && "grid grid-cols-3")}>
          {tile && [0, 1, 2, 3].map(tileCopy)}
          <div
            className={cn("relative shrink-0 shadow-lg", tile && "z-10 outline outline-primary/70")}
            style={{ width: w * zoom, height: h * zoom, background: CHECKER, backgroundSize: `${zoom * 2}px ${zoom * 2}px` }}
          >
            {onion &&
              onionOffsets.map((o) => (
                <canvas
                  key={o}
                  ref={(c) => {
                    if (c) onionCanvases.current.set(o, c);
                    else onionCanvases.current.delete(o);
                  }}
                  width={w}
                  height={h}
                  className="pointer-events-none absolute inset-0 size-full [image-rendering:pixelated]"
                  style={{ opacity: 0.5 / Math.abs(o) }}
                />
              ))}
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
            {/* Symmetry axes: what is drawn on one side is copied across these lines */}
            {(symmetry === "h" || symmetry === "both" || symmetry === "radial") && (
              <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-primary" style={{ left: (w * zoom) / 2 }} />
            )}
            {(symmetry === "v" || symmetry === "both" || symmetry === "radial") && (
              <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-primary" style={{ top: (h * zoom) / 2 }} />
            )}
            {/* Seams: red bars on both sides of each edge pixel that doesn't continue on the other side */}
            {report?.rows.flatMap((y) =>
              [-3, w * zoom].map((left) => (
                <div key={`r${y}${left}`} className="pointer-events-none absolute w-[3px] bg-destructive" style={{ left, top: y * zoom, height: zoom }} />
              )),
            )}
            {report?.cols.flatMap((x) =>
              [-3, h * zoom].map((top) => (
                <div key={`c${x}${top}`} className="pointer-events-none absolute h-[3px] bg-destructive" style={{ top, left: x * zoom, width: zoom }} />
              )),
            )}
          </div>
          {tile && [4, 5, 6, 7].map(tileCopy)}
          </div>
        </main>

        <aside className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-l p-3">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium text-muted-foreground">Prévia</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {(playing ? playedFrame : frame) + 1}/{frames.current.length}
              </span>
            </div>
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
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" title="Frame anterior (,)" aria-label="Frame anterior" onClick={() => stepFrame(-1)}>
                <StepBack />
              </Button>
              <Button
                variant={playing ? "default" : "outline"}
                size="icon-sm"
                title={playing ? "Pausar (Enter)" : "Tocar (Enter)"}
                aria-label={playing ? "Pausar" : "Tocar"}
                onClick={togglePlay}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
              <Button variant="ghost" size="icon-sm" title="Próximo frame (.)" aria-label="Próximo frame" onClick={() => stepFrame(1)}>
                <StepForward />
              </Button>
              <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground" title="Quadros por segundo">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={fps}
                  onChange={(e) => setFps(Math.min(60, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                  className="h-7 w-11 rounded-md border bg-background px-1.5 text-sm text-foreground"
                />
                fps
              </label>
            </div>
            <div className="flex gap-1" role="group" aria-label="Repetição">
              {LOOPS.map((l) => (
                <Button
                  key={l.id}
                  variant={loop === l.id ? "secondary" : "ghost"}
                  size="xs"
                  className="flex-1"
                  aria-pressed={loop === l.id}
                  onClick={() => setLoop(l.id)}
                >
                  {l.label}
                </Button>
              ))}
            </div>
          </section>

          {report && (
            <section className="flex flex-col gap-1.5">
              <h2 className="text-xs font-medium text-muted-foreground">Textura</h2>
              <SeamLine label="Esquerda e direita" count={report.rows.length} />
              <SeamLine label="Cima e baixo" count={report.cols.length} />
              <p className="text-xs text-muted-foreground">As marcas vermelhas mostram onde a borda não continua do outro lado.</p>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">Cor</h2>
            <ColorPicker value={color} onChange={pickColor} />
          </section>

          <PalettePanel color={color} onPick={pickColor} getImage={() => img.current} applyImage={applyImage} />
        </aside>
      </div>

      <Timeline
        frames={frames.current}
        current={frame}
        version={version}
        onSelect={showFrame}
        onAdd={addFrame}
        onDelete={deleteFrame}
        onion={onion}
        onToggleOnion={() => setOnion((o) => !o)}
        onionRange={onionRange}
        onOnionRange={setOnionRange}
      />

      <footer className="flex h-6 shrink-0 items-center gap-3 border-t px-3 font-mono text-xs text-muted-foreground">
        <span>
          {w}x{h}
        </span>
        <span>{zoom}x</span>
        <span>
          frame {frame + 1}/{frames.current.length}
        </span>
        <span>{cursor}</span>
        {sel && (
          <span>
            seleção {sel.w}x{sel.h}
          </span>
        )}
        {symmetry !== "off" && <span>{sym.label.toLowerCase()}</span>}
      </footer>
      <SpriteSheetDialog
        open={sheetOpen}
        current={() => ({ name: path ? path.split(/[\\/]/).pop()!.replace(/\.png$/i, "") : "desenho", img: clone(img.current) })}
        allFrames={() => frames.current.map((f, i) => ({ name: `frame ${i + 1}`, img: clone(f) }))}
        onClose={() => setSheetOpen(false)}
      />
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

function SeamLine({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={count ? "text-warning" : "text-success"}>
        {count ? `${count} ${count > 1 ? "emendas" : "emenda"}` : "sem emenda"}
      </span>
    </div>
  );
}

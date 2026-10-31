import { Copy, Layers, Pause, Play, Plus, Trash2 } from "lucide-react";
import { Thumb } from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import type { Img } from "@/lib/pixels";
import { cn } from "@/lib/utils";

// Onion skin tints: frames before the current one in red, frames after in blue (same as Aseprite)
export const ONION_PREV = "rgb(255 70 70 / 0.65)";
export const ONION_NEXT = "rgb(70 150 255 / 0.65)";

type Props = {
  frames: Img[];
  current: number;
  /** Changes whenever a frame is drawn on, so the thumbnails repaint */
  version: number;
  onSelect: (i: number) => void;
  onAdd: (copy: boolean) => void;
  onDelete: () => void;
  onion: boolean;
  onToggleOnion: () => void;
  onionRange: number;
  onOnionRange: (n: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  fps: number;
  onFps: (n: number) => void;
};

/** Frame strip under the canvas: play, frames, add/duplicate/delete, onion skin */
export function Timeline(p: Props) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-t px-3">
      <div className="flex items-center gap-1.5">
        <Button
          variant={p.playing ? "default" : "outline"}
          size="icon-sm"
          title={p.playing ? "Pausar (Enter)" : "Tocar na prévia (Enter)"}
          aria-label={p.playing ? "Pausar" : "Tocar"}
          onClick={p.onTogglePlay}
        >
          {p.playing ? <Pause /> : <Play />}
        </Button>
        <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Quadros por segundo">
          <input
            type="number"
            min={1}
            max={60}
            value={p.fps}
            onChange={(e) => p.onFps(Math.min(60, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
            className="h-7 w-12 rounded-md border bg-background px-1.5 text-sm text-foreground"
          />
          fps
        </label>
      </div>

      <div className="h-8 w-px bg-border" />

      <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
        {p.frames.map((f, i) => (
          <li key={i}>
            <button
              title={`Frame ${i + 1} (, e . trocam)`}
              aria-label={`Frame ${i + 1}`}
              aria-current={i === p.current}
              onClick={() => p.onSelect(i)}
              className={cn(
                "relative grid size-11 place-items-center rounded-md border",
                i === p.current ? "border-primary bg-accent" : "hover:bg-muted",
              )}
            >
              <Thumb img={f} size={32} version={p.version} />
              <span className="absolute right-0.5 bottom-0 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
            </button>
          </li>
        ))}
        <li className="flex gap-0.5 pl-1">
          <Button variant="ghost" size="icon-sm" title="Novo frame vazio" aria-label="Novo frame" onClick={() => p.onAdd(false)}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Duplicar frame" aria-label="Duplicar frame" onClick={() => p.onAdd(true)}>
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Excluir frame"
            aria-label="Excluir frame"
            disabled={p.frames.length === 1}
            onClick={p.onDelete}
          >
            <Trash2 />
          </Button>
        </li>
      </ol>

      <div className="h-8 w-px bg-border" />

      <div className="flex items-center gap-1.5">
        <Button
          variant={p.onion ? "default" : "outline"}
          size="sm"
          title="Onion skin: mostra os frames vizinhos transparentes (O)"
          aria-pressed={p.onion}
          onClick={p.onToggleOnion}
        >
          <Layers />
          Onion
        </Button>
        <select
          aria-label="Frames de cada lado"
          title="Quantos frames antes e depois"
          value={p.onionRange}
          onChange={(e) => p.onOnionRange(Number(e.target.value))}
          className="h-7 rounded-md border bg-background px-1 text-sm"
        >
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              ±{n}
            </option>
          ))}
        </select>
        <span className="flex flex-col text-[10px] leading-tight text-muted-foreground">
          <span>
            <span className="mr-1 inline-block size-2 rounded-full" style={{ background: ONION_PREV }} />
            antes
          </span>
          <span>
            <span className="mr-1 inline-block size-2 rounded-full" style={{ background: ONION_NEXT }} />
            depois
          </span>
        </span>
      </div>
    </div>
  );
}

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronUp, Film, FolderOpen, Images, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Thumb } from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import type { Img } from "@/lib/pixels";
import { PNG_FILTER, decodePng, encodePng, toImageData } from "@/lib/png";
import { buildSheet, type Align, type SheetOptions } from "@/lib/sheet";

export type Sprite = { name: string; img: Img };

const MAX_SPRITE_SIDE = 512;
const ALIGNS: { id: Align; label: string }[] = [
  { id: "bottom", label: "Base (pés na mesma linha)" },
  { id: "center", label: "Centro" },
  { id: "top-left", label: "Canto superior esquerdo" },
];
const CHECKER = "repeating-conic-gradient(#7d8294 0 25%, #9aa0b3 0 50%) 0 0 / 16px 16px";

const baseName = (path: string) => path.split(/[\\/]/).pop()!.replace(/\.png$/i, "");

/** Builds a sprite sheet from PNG files and/or the current drawing, previews it and exports PNG (+ JSON).
 *  Stays mounted while hidden, so the list survives closing it to draw the next frame. */
export function SpriteSheetDialog({
  open: visible,
  current,
  allFrames,
  onClose,
}: {
  open: boolean;
  current: () => Sprite;
  allFrames: () => Sprite[];
  onClose: () => void;
}) {
  const [sprites, setSprites] = useState<Sprite[]>([]);
  const [opts, setOpts] = useState<SheetOptions>({ columns: 4, spacing: 1, padding: 0, align: "bottom" });
  const [withJson, setWithJson] = useState(true);
  const preview = useRef<HTMLCanvasElement>(null);
  const sheet = useMemo(() => buildSheet(sprites.map((s) => s.img), opts), [sprites, opts]);
  // Biggest whole-number zoom that fits the preview box
  const scale = Math.max(1, Math.floor(Math.min(560 / sheet.img.w, 360 / sheet.img.h)));

  useLayoutEffect(() => {
    preview.current?.getContext("2d")!.putImageData(toImageData(sheet.img), 0, 0);
  }, [sheet]);

  const set = (patch: Partial<SheetOptions>) => setOpts((o) => ({ ...o, ...patch }));

  async function addFiles() {
    const paths = await open({ filters: PNG_FILTER, multiple: true });
    if (!paths) return;
    const added: Sprite[] = [];
    for (const p of paths) {
      try {
        added.push({ name: baseName(p), img: await decodePng(await invoke<number[]>("read_file", { path: p }), MAX_SPRITE_SIDE) });
      } catch (err) {
        toast.error(`${baseName(p)}: ${err}`);
      }
    }
    setSprites((s) => [...s, ...added]);
  }

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= sprites.length) return;
    const next = sprites.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setSprites(next);
  }

  async function exportSheet() {
    if (!sprites.length) return toast.info("Adicione pelo menos um sprite.");
    let p = await save({ filters: PNG_FILTER, defaultPath: "spritesheet.png" });
    if (!p) return;
    if (!/\.png$/i.test(p)) p += ".png";
    try {
      await invoke("write_file", { path: p, bytes: await encodePng(sheet.img) });
      if (withJson) {
        // Cell rectangles in sheet order: what game engines need to slice the sheet
        const json = {
          image: p.split(/[\\/]/).pop(),
          width: sheet.img.w,
          height: sheet.img.h,
          cellWidth: sheet.cellW,
          cellHeight: sheet.cellH,
          columns: sheet.columns,
          rows: sheet.rows,
          spacing: opts.spacing,
          padding: opts.padding,
          frames: sprites.map((s, i) => ({ name: s.name, ...sheet.cells[i] })),
        };
        const bytes = Array.from(new TextEncoder().encode(JSON.stringify(json, null, 2)));
        await invoke("write_file", { path: p.replace(/\.png$/i, ".json"), bytes });
      }
      toast.success(`Spritesheet salva em ${p}`);
    } catch (err) {
      toast.error(String(err));
    }
  }

  const num = (label: string, value: number, min: number, onChange: (n: number) => void) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.floor(Number(e.target.value) || 0)))}
        className="h-7 w-full rounded-md border bg-background px-2 text-sm text-foreground"
      />
    </label>
  );

  return (
    <div
      className={`fixed inset-0 z-50 place-items-center bg-black/50 p-6 ${visible ? "grid" : "hidden"}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-label="Gerador de spritesheet" className="flex max-h-full w-[920px] max-w-full flex-col rounded-lg border bg-card shadow-2xl">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b pl-4">
          <Images className="size-4 text-primary" />
          <span className="flex-1 font-medium">Gerador de spritesheet</span>
          <Button variant="ghost" size="icon" aria-label="Fechar" title="Fechar (Esc)" onClick={onClose}>
            <X />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-64 shrink-0 flex-col gap-2 border-r p-3">
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="col-span-2"
                title="Adiciona todos os frames da animação, em ordem"
                onClick={() => setSprites((s) => [...s, ...allFrames()])}
              >
                <Film />
                Todos os frames
              </Button>
              <Button variant="outline" size="sm" onClick={addFiles}>
                <FolderOpen />
                PNGs
              </Button>
              <Button variant="outline" size="sm" title="Adiciona o que está no editor agora" onClick={() => setSprites((s) => [...s, current()])}>
                <Plus />
                Desenho atual
              </Button>
            </div>
            <ol className="flex min-h-40 flex-1 flex-col gap-1 overflow-y-auto">
              {sprites.length === 0 && <li className="p-2 text-xs text-muted-foreground">Nenhum sprite ainda.</li>}
              {sprites.map((s, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted">
                  <span className="w-4 text-right font-mono text-xs text-muted-foreground">{i}</span>
                  <Thumb img={s.img} />
                  <span className="min-w-0 flex-1 truncate" title={s.name}>
                    {s.name}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">
                      {s.img.w}x{s.img.h}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon-xs" aria-label="Subir" onClick={() => move(i, -1)}>
                    <ChevronUp />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Descer" onClick={() => move(i, 1)}>
                    <ChevronDown />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Remover" onClick={() => setSprites(sprites.filter((_, k) => k !== i))}>
                    <X />
                  </Button>
                </li>
              ))}
            </ol>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col gap-3 p-3">
            <div className="grid grid-cols-4 gap-2">
              {num("Colunas", opts.columns, 1, (columns) => set({ columns }))}
              {num("Espaçamento (px)", opts.spacing, 0, (spacing) => set({ spacing }))}
              {num("Margem (px)", opts.padding, 0, (padding) => set({ padding }))}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Alinhamento
                <select
                  value={opts.align}
                  onChange={(e) => set({ align: e.target.value as Align })}
                  className="h-7 rounded-md border bg-background px-1 text-sm text-foreground"
                >
                  {ALIGNS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-md bg-muted/40 p-3">
              <canvas
                ref={preview}
                width={sheet.img.w}
                height={sheet.img.h}
                className="[image-rendering:pixelated]"
                style={{ width: sheet.img.w * scale, height: sheet.img.h * scale, background: CHECKER }}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                {sheet.img.w}x{sheet.img.h} · célula {sheet.cellW}x{sheet.cellH} · {sheet.columns}x{sheet.rows}
              </span>
              <label className="ml-auto flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={withJson} onChange={(e) => setWithJson(e.target.checked)} />
                Salvar JSON com os quadros
              </label>
              <Button onClick={exportSheet} disabled={!sprites.length}>
                Exportar PNG
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

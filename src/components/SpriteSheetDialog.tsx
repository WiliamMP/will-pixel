import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Film, FolderOpen, Images, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Modal, NumberField, SheetPreview } from "@/components/dialogParts";
import { Thumb } from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import { exportPng, pickPngs, type Sprite } from "@/lib/files";
import { buildSheet, type Align, type SheetOptions } from "@/lib/sheet";

const MAX_SPRITE_SIDE = 512;
const ALIGNS: { id: Align; label: string }[] = [
  { id: "bottom", label: "Base (pés na mesma linha)" },
  { id: "center", label: "Centro" },
  { id: "top-left", label: "Canto superior esquerdo" },
];

/** Builds a sprite sheet from PNG files and/or the current drawing, previews it and exports PNG (+ JSON) */
export function SpriteSheetDialog({
  open,
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
  const sheet = useMemo(() => buildSheet(sprites.map((s) => s.img), opts), [sprites, opts]);

  const set = (patch: Partial<SheetOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const add = (more: Sprite[]) => setSprites((s) => [...s, ...more]);

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= sprites.length) return;
    const next = sprites.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setSprites(next);
  }

  function exportSheet() {
    if (!sprites.length) return toast.info("Adicione pelo menos um sprite.");
    // Cell rectangles in sheet order: what game engines need to slice the sheet
    const json = (image: string) => ({
      image,
      width: sheet.img.w,
      height: sheet.img.h,
      cellWidth: sheet.cellW,
      cellHeight: sheet.cellH,
      columns: sheet.columns,
      rows: sheet.rows,
      spacing: opts.spacing,
      padding: opts.padding,
      frames: sprites.map((s, i) => ({ name: s.name, ...sheet.cells[i] })),
    });
    exportPng(sheet.img, "spritesheet.png", withJson ? json : undefined);
  }

  return (
    <Modal open={open} title="Gerador de spritesheet" icon={Images} onClose={onClose} className="w-[920px]">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col gap-2 border-r p-3">
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="col-span-2"
              title="Adiciona todos os frames da animação, em ordem"
              onClick={() => add(allFrames())}
            >
              <Film />
              Todos os frames
            </Button>
            <Button variant="outline" size="sm" onClick={async () => add(await pickPngs(MAX_SPRITE_SIDE))}>
              <FolderOpen />
              PNGs
            </Button>
            <Button variant="outline" size="sm" title="Adiciona o que está no editor agora" onClick={() => add([current()])}>
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
            <NumberField label="Colunas" value={opts.columns} min={1} onChange={(columns) => set({ columns })} />
            <NumberField label="Espaçamento (px)" value={opts.spacing} min={0} onChange={(spacing) => set({ spacing })} />
            <NumberField label="Margem (px)" value={opts.padding} min={0} onChange={(padding) => set({ padding })} />
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
            <SheetPreview img={sheet.img} maxW={560} maxH={360} />
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
    </Modal>
  );
}

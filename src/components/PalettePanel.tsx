import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { Brush, Copy, FilePlus2, FolderOpen, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { extractColors, ramp, remap, similarPairs } from "@/lib/color";
import type { Img } from "@/lib/pixels";
import { PNG_FILTER, decodePng } from "@/lib/png";
import { cn } from "@/lib/utils";

type Palette = { name: string; colors: string[] };
type Store = { active: number; list: Palette[] };

const KEY = "will-pixel.palettes";
// Colors pulled from an image; more than this are reduced with median cut
const MAX_EXTRACT = 16;
// Reference images for palettes can be bigger than a sprite
const MAX_REFERENCE_SIDE = 2048;

const PRESETS: Palette[] = [
  {
    // the colors of the first sprites (Sword1, Sword2, Character_Base)
    name: "Will",
    colors: [
      "#1a1626", "#5a5a6a", "#9a9aae", "#ffffff", "#c8902a", "#f0c850", "#8a5a2b", "#5c3a1e",
      "#8a2020", "#c03838", "#e86060", "#ffd2b4", "#c5987a", "#262b44", "#3a4466", "#60a4ff",
    ],
  },
  {
    name: "PICO-8",
    colors: [
      "#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
      "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa",
    ],
  },
  {
    name: "Sweetie 16",
    colors: [
      "#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070", "#38b764", "#257179",
      "#29366f", "#3b5dc9", "#41a6f6", "#73eff7", "#f4f4f4", "#94b0c2", "#566c86", "#333c57",
    ],
  },
];

function loadStore(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Store | null;
    if (s?.list?.length) return { active: Math.min(Math.max(0, s.active), s.list.length - 1), list: s.list };
  } catch {}
  return { active: 0, list: structuredClone(PRESETS) };
}

type Props = {
  color: string;
  onPick: (hex: string) => void;
  getImage: () => Img;
  /** Replaces the drawing as one undoable step */
  applyImage: (next: Img) => void;
};

/** Color variations plus the palette manager: several saved palettes, extract, convert, similar colors */
export function PalettePanel({ color, onPick, getImage, applyImage }: Props) {
  const [store, setStore] = useState(loadStore);
  const pal = store.list[store.active];
  const variations = useMemo(() => ramp(color), [color]);
  const similar = useMemo(() => similarPairs(pal.colors), [pal.colors]);
  const flagged = new Set(similar.flat());

  function save(next: Store) {
    setStore(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  const update = (patch: Partial<Palette>) =>
    save({ ...store, list: store.list.map((p, i) => (i === store.active ? { ...p, ...patch } : p)) });
  const addColors = (hexes: string[]) => update({ colors: [...pal.colors, ...hexes.filter((h) => !pal.colors.includes(h))] });
  const addPalette = (p: Palette) => save({ active: store.list.length, list: [...store.list, p] });

  async function removePalette() {
    if (store.list.length === 1) return toast.info("Precisa sobrar pelo menos uma paleta.");
    if (!(await ask(`Excluir a paleta "${pal.name}"?`, { title: "will-pixel", kind: "warning" }))) return;
    save({ active: Math.max(0, store.active - 1), list: store.list.filter((_, i) => i !== store.active) });
  }

  function fromDrawing() {
    const colors = extractColors(getImage(), MAX_EXTRACT);
    if (!colors.length) return toast.info("O desenho está vazio.");
    addPalette({ name: "Do desenho", colors });
  }

  async function fromFile() {
    const p = await open({ filters: PNG_FILTER });
    if (typeof p !== "string") return;
    try {
      const img = await decodePng(await invoke<number[]>("read_file", { path: p }), MAX_REFERENCE_SIDE);
      const colors = extractColors(img, MAX_EXTRACT);
      if (!colors.length) return toast.info("A imagem é toda transparente.");
      addPalette({ name: p.split(/[\\/]/).pop()!.replace(/\.png$/i, ""), colors });
    } catch (err) {
      toast.error(String(err));
    }
  }

  function convertDrawing() {
    if (!pal.colors.length) return toast.info("A paleta está vazia.");
    applyImage(remap(getImage(), pal.colors));
    toast.success(`Desenho convertido para "${pal.name}"`);
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-muted-foreground">Variações</h2>
          <Button variant="ghost" size="icon-xs" title="Adicionar todas à paleta" aria-label="Adicionar variações à paleta" onClick={() => addColors(variations)}>
            <Plus />
          </Button>
        </div>
        <div className="flex gap-1">
          {variations.map((hex) => (
            <Swatch key={hex} hex={hex} active={hex === color} onClick={() => onPick(hex)} className="flex-1" />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-muted-foreground">Paleta</h2>
          <div className="flex">
            <Button variant="ghost" size="icon-xs" title="Nova paleta vazia" aria-label="Nova paleta" onClick={() => addPalette({ name: "Nova paleta", colors: [] })}>
              <FilePlus2 />
            </Button>
            <Button variant="ghost" size="icon-xs" title="Duplicar paleta" aria-label="Duplicar paleta" onClick={() => addPalette({ name: `${pal.name} (cópia)`, colors: [...pal.colors] })}>
              <Copy />
            </Button>
            <Button variant="ghost" size="icon-xs" title="Excluir paleta" aria-label="Excluir paleta" onClick={removePalette}>
              <Trash2 />
            </Button>
          </div>
        </div>
        <select
          aria-label="Paleta"
          className="h-7 rounded-md border bg-background px-2 text-sm"
          value={store.active}
          onChange={(e) => save({ ...store, active: Number(e.target.value) })}
        >
          {store.list.map((p, i) => (
            <option key={i} value={i}>
              {p.name} ({p.colors.length})
            </option>
          ))}
        </select>
        <input
          aria-label="Nome da paleta"
          title="Nome da paleta"
          spellCheck={false}
          value={pal.name}
          onChange={(e) => update({ name: e.target.value })}
          className="h-7 rounded-md border bg-background px-2 text-sm"
        />
        <div className="grid grid-cols-8 gap-1">
          {pal.colors.map((hex) => (
            <Swatch
              key={hex}
              hex={hex}
              active={hex === color}
              warn={flagged.has(hex)}
              title={`${hex} · botão direito remove`}
              onClick={() => onPick(hex)}
              onContextMenu={(e) => {
                e.preventDefault();
                update({ colors: pal.colors.filter((c) => c !== hex) });
              }}
            />
          ))}
          <button
            title="Adicionar a cor atual"
            aria-label="Adicionar a cor atual"
            disabled={pal.colors.includes(color)}
            onClick={() => addColors([color])}
            className="grid aspect-square place-items-center rounded-sm border border-dashed text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <Plus className="size-3" />
          </button>
        </div>

        {similar.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
            <span className="flex items-center gap-1.5 text-warning">
              <TriangleAlert className="size-3.5" />
              {similar.length === 1 ? "1 par de cores parecidas" : `${similar.length} pares de cores parecidas`}
            </span>
            <div className="flex flex-wrap gap-2">
              {similar.map(([a, b]) => (
                <span key={a + b} className="flex overflow-hidden rounded-sm border border-black/30" title={`${a} e ${b}`}>
                  <span className="size-4" style={{ background: a }} />
                  <span className="size-4" style={{ background: b }} />
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" title="Nova paleta com as cores do desenho" onClick={fromDrawing}>
            <Brush />
            Do desenho
          </Button>
          <Button variant="outline" size="sm" title="Nova paleta com as cores de um PNG" onClick={fromFile}>
            <FolderOpen />
            De imagem
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="col-span-2"
            title="Troca cada cor do desenho pela cor mais próxima desta paleta"
            onClick={convertDrawing}
          >
            Converter desenho para esta paleta
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Botão direito no desenho apaga.</p>
      </section>
    </>
  );
}

function Swatch({
  hex,
  active,
  warn,
  className,
  ...props
}: { hex: string; active?: boolean; warn?: boolean } & React.ComponentProps<"button">) {
  return (
    <button
      title={hex}
      aria-label={hex}
      className={cn(
        "relative aspect-square rounded-sm border border-black/30",
        active && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        className,
      )}
      style={{ background: hex }}
      {...props}
    >
      {/* marks colors that are almost the same as another one */}
      {warn && <span className="absolute -top-1 -right-1 size-2 rounded-full border border-background bg-warning" />}
    </button>
  );
}

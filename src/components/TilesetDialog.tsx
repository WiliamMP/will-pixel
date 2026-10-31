import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Film, FolderOpen, Grid3x3, Plus, Scissors, SquarePen } from "lucide-react";
import { Modal, NumberField } from "@/components/dialogParts";
import { Button } from "@/components/ui/button";
import { exportPng, exportPngs, pickPngs, type Sprite } from "@/lib/files";
import { crop, type Img } from "@/lib/pixels";
import { toImageData } from "@/lib/png";
import { buildSheet } from "@/lib/sheet";
import { gridSize, isEmptyTile, tileAt, tileRect, type Grid } from "@/lib/tiles";

const MAX_SOURCE_SIDE = 2048;
const CHECKER = "repeating-conic-gradient(#7d8294 0 25%, #9aa0b3 0 50%) 0 0 / 16px 16px";

/** Tileset tool: build one from the editor frames or open one, set the grid,
 *  pick tiles and export them as separate PNGs or send them to the editor */
export function TilesetDialog({
  open,
  current,
  allFrames,
  cut,
  onEdit,
  onClose,
}: {
  open: boolean;
  current: () => Sprite;
  allFrames: () => Sprite[];
  /** The editor's cut grid size, used as the tile size for the current drawing (0 = keep the grid) */
  cut: number;
  /** Loads the picked tiles into the editor, one frame each */
  onEdit: (tiles: Img[]) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Sprite | null>(null);
  const [grid, setGrid] = useState<Grid>({ tileW: 16, tileH: 16, margin: 0, spacing: 0 });
  const [columns, setColumns] = useState(8);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const image = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);

  const img = source?.img;
  const { cols, rows } = img ? gridSize(img.w, img.h, grid) : { cols: 0, rows: 0 };
  const scale = img ? Math.max(1, Math.floor(Math.min(560 / img.w, 400 / img.h))) : 1;
  const empty = useMemo(
    () => new Set(Array.from({ length: cols * rows }, (_, i) => i).filter((i) => img && isEmptyTile(img, tileRect(grid, i % cols, Math.floor(i / cols))))),
    [img, grid, cols, rows],
  );

  function load(s: Sprite, g?: Grid) {
    setSource(s);
    if (g) setGrid(g);
    setPicked(new Set());
  }

  function setGridField(patch: Partial<Grid>) {
    setGrid((g) => ({ ...g, ...patch }));
    setPicked(new Set());
  }

  /** Lays the editor frames out as tiles, with the current margin and spacing */
  function buildFromFrames() {
    const frames = allFrames();
    const sheet = buildSheet(
      frames.map((f) => f.img),
      { columns, spacing: grid.spacing, padding: grid.margin, align: "top-left" },
    );
    load({ name: "tileset", img: sheet.img }, { ...grid, tileW: sheet.cellW, tileH: sheet.cellH });
  }

  // Image at screen zoom, and the grid drawn over it at screen resolution so lines stay 1px
  useLayoutEffect(() => {
    if (!img) return;
    image.current!.getContext("2d")!.putImageData(toImageData(img), 0, 0);
    const c = overlay.current!;
    c.width = img.w * scale;
    c.height = img.h * scale;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < cols * rows; i++) {
      const r = tileRect(grid, i % cols, Math.floor(i / cols));
      const [x, y, w, h] = [r.x * scale, r.y * scale, r.w * scale, r.h * scale];
      if (picked.has(i)) {
        ctx.fillStyle = "rgb(124 92 255 / 0.35)";
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = picked.has(i) ? "#7c5cff" : "rgb(255 255 255 / 0.45)";
      ctx.lineWidth = picked.has(i) ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }, [img, grid, cols, rows, scale, picked]);

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = tileAt(Math.floor((e.clientX - r.left) / scale), Math.floor((e.clientY - r.top) / scale), grid, cols, rows);
    if (i === null) return;
    const next = new Set(picked);
    if (!next.delete(i)) next.add(i);
    setPicked(next);
  }

  const all = Array.from({ length: cols * rows }, (_, i) => i);
  const tilesOf = (ids: number[]): Sprite[] =>
    ids.map((i) => ({ name: `${source!.name}_${i}`, img: crop(img!, tileRect(grid, i % cols, Math.floor(i / cols))) }));
  const pickedIds = [...picked].sort((a, b) => a - b);

  return (
    <Modal open={open} title="Tileset" icon={Grid3x3} onClose={onClose} className="w-[980px]">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3">
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">Origem</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const [s] = await pickPngs(MAX_SOURCE_SIDE);
                if (s) load(s);
              }}
            >
              <FolderOpen />
              Abrir tileset (PNG)
            </Button>
            <Button variant="outline" size="sm" title="Usa o desenho do editor como tileset" onClick={() => load(current(), cut ? { tileW: cut, tileH: cut, margin: 0, spacing: 0 } : undefined)}>
              <Plus />
              Desenho atual
            </Button>
            <Button variant="outline" size="sm" title="Cada frame do editor vira um tile" onClick={buildFromFrames}>
              <Film />
              Montar com os frames
            </Button>
            <NumberField label="Colunas (ao montar)" value={columns} min={1} onChange={setColumns} />
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">Grade</h3>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Largura do tile" value={grid.tileW} min={1} onChange={(tileW) => setGridField({ tileW })} />
              <NumberField label="Altura do tile" value={grid.tileH} min={1} onChange={(tileH) => setGridField({ tileH })} />
              <NumberField label="Margem (px)" value={grid.margin} min={0} onChange={(margin) => setGridField({ margin })} />
              <NumberField label="Espaçamento (px)" value={grid.spacing} min={0} onChange={(spacing) => setGridField({ spacing })} />
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">Seleção</h3>
            <div className="grid grid-cols-3 gap-1.5">
              <Button variant="outline" size="xs" disabled={!img} onClick={() => setPicked(new Set(all))}>
                Todos
              </Button>
              <Button variant="outline" size="xs" disabled={!img} title="Todos menos os vazios" onClick={() => setPicked(new Set(all.filter((i) => !empty.has(i))))}>
                Com desenho
              </Button>
              <Button variant="outline" size="xs" disabled={!picked.size} onClick={() => setPicked(new Set())}>
                Nenhum
              </Button>
            </div>
          </section>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-3 p-3">
          <div className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-md bg-muted/40 p-3">
            {img ? (
              <div className="relative" style={{ width: img.w * scale, height: img.h * scale }}>
                <canvas
                  ref={image}
                  width={img.w}
                  height={img.h}
                  className="absolute inset-0 size-full [image-rendering:pixelated]"
                  style={{ background: CHECKER }}
                />
                <canvas ref={overlay} className="absolute inset-0 size-full cursor-pointer" onClick={onClick} />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Abra um tileset, use o desenho atual ou monte um com os frames.</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto font-mono text-xs text-muted-foreground">
              {img ? `${img.w}x${img.h} · ${cols}x${rows} tiles · ${picked.size} selecionado(s) · clique para marcar` : "sem imagem"}
            </span>
            <Button variant="outline" disabled={!img} onClick={() => exportPng(img!, `${source!.name}.png`)}>
              Exportar tileset
            </Button>
            <Button
              variant="outline"
              disabled={!picked.size}
              title="Cada tile selecionado vira um frame no editor"
              onClick={() => {
                onEdit(tilesOf(pickedIds).map((t) => t.img));
                onClose();
              }}
            >
              <SquarePen />
              Editar no editor
            </Button>
            <Button disabled={!picked.size} title="Um PNG por tile, numerados como nas engines" onClick={() => exportPngs(tilesOf(pickedIds))}>
              <Scissors />
              Exportar recortes
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

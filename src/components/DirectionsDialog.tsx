import { useMemo, useState } from "react";
import { Compass, Film, FolderOpen, Plus, TriangleAlert, X } from "lucide-react";
import { Modal, NumberField, SheetPreview } from "@/components/dialogParts";
import { Thumb } from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import { DIRECTIONS, gridSprites, mirrored, trimRow, unionBounds, type Direction } from "@/lib/directions";
import { exportPng, pickPngs, type Sprite } from "@/lib/files";
import { buildSheet } from "@/lib/sheet";
import { cn } from "@/lib/utils";

const MAX_SPRITE_SIDE = 512;
const EMPTY: Record<Direction, Sprite[]> = { down: [], left: [], right: [], up: [] };

/** Puts a character's 4 directions in one sheet, one row each, all cells the same size
 *  and every direction standing on the same baseline */
export function DirectionsDialog({
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
  const [rows, setRows] = useState(EMPTY);
  // Left is usually right flipped: drawn once, always in sync
  const [mirrorLeft, setMirrorLeft] = useState(false);
  const [trim, setTrim] = useState(true);
  const [spacing, setSpacing] = useState(1);
  const [withJson, setWithJson] = useState(true);

  const add = (d: Direction, more: Sprite[]) => setRows((r) => ({ ...r, [d]: [...r[d], ...more] }));
  const imgsOf = (d: Direction) =>
    d === "left" && mirrorLeft ? mirrored(rows.right.map((s) => s.img)) : rows[d].map((s) => s.img);

  const { sheet, report } = useMemo(() => {
    const raw = DIRECTIONS.map((d) => imgsOf(d.id));
    const used = trim ? raw.map(trimRow) : raw;
    const { sprites, columns } = gridSprites(used);
    const sheet = buildSheet(sprites, { columns, spacing, padding: 0, align: "bottom" });
    // What each direction holds, to spot the ones that don't match the others
    const report = DIRECTIONS.map((d, i) => ({ ...d, frames: raw[i].length, size: unionBounds(raw[i]) }));
    return { sheet, report };
  }, [rows, mirrorLeft, trim, spacing]);

  const filled = report.filter((r) => r.frames > 0);
  const maxFrames = Math.max(0, ...filled.map((r) => r.frames));
  const maxHeight = Math.max(0, ...filled.map((r) => r.size?.h ?? 0));
  const warnings = [
    filled.some((r) => r.frames !== maxFrames) && "As direções têm números de frames diferentes.",
    filled.some((r) => r.size && r.size.h !== maxHeight) && "As direções têm alturas diferentes: o personagem pode parecer encolher ao virar.",
    filled.length < 4 && filled.length > 0 && "Falta desenhar alguma direção.",
  ].filter(Boolean) as string[];

  function exportSheet() {
    const json = (image: string) => ({
      image,
      cellWidth: sheet.cellW,
      cellHeight: sheet.cellH,
      spacing,
      // one row per direction, in this order; frames run left to right
      directions: Object.fromEntries(
        DIRECTIONS.map((d, row) => [d.id, { row, frames: report[row].frames, y: row * (sheet.cellH + spacing) }]),
      ),
    });
    exportPng(sheet.img, "direcoes.png", withJson ? json : undefined);
  }

  return (
    <Modal open={open} title="Direções do personagem" icon={Compass} onClose={onClose} className="w-[1040px]">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[420px] shrink-0 flex-col gap-3 overflow-y-auto border-r p-3">
          {DIRECTIONS.map((d) => {
            const linked = d.id === "left" && mirrorLeft;
            const imgs = imgsOf(d.id);
            return (
              <section key={d.id} className="flex flex-col gap-1.5 rounded-md border p-2">
                <div className="flex items-center gap-1">
                  <h3 className="flex-1 text-sm font-medium">{d.label}</h3>
                  {!linked && (
                    <>
                      <Button variant="ghost" size="icon-sm" title="Frame atual" aria-label={`Frame atual em ${d.label}`} onClick={() => add(d.id, [current()])}>
                        <Plus />
                      </Button>
                      <Button variant="ghost" size="icon-sm" title="Todos os frames da animação" aria-label={`Todos os frames em ${d.label}`} onClick={() => add(d.id, allFrames())}>
                        <Film />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="PNGs"
                        aria-label={`PNGs em ${d.label}`}
                        onClick={async () => add(d.id, await pickPngs(MAX_SPRITE_SIDE))}
                      >
                        <FolderOpen />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Limpar"
                        aria-label={`Limpar ${d.label}`}
                        disabled={!rows[d.id].length}
                        onClick={() => setRows((r) => ({ ...r, [d.id]: [] }))}
                      >
                        <X />
                      </Button>
                    </>
                  )}
                </div>
                {d.id === "left" && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={mirrorLeft} onChange={(e) => setMirrorLeft(e.target.checked)} />
                    Usar Leste espelhado
                  </label>
                )}
                <div className="flex min-h-9 flex-wrap items-center gap-1">
                  {imgs.length === 0 && <span className="text-xs text-muted-foreground">Vazio</span>}
                  {imgs.map((img, i) => (
                    <span key={i} className="grid size-9 place-items-center rounded-sm border">
                      <Thumb img={img} size={28} />
                    </span>
                  ))}
                </div>
              </section>
            );
          })}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-3 p-3">
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-1.5 pb-1.5 text-xs" title="Recorta o espaço vazio de cada direção e põe todas com os pés na mesma linha">
              <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
              Alinhar pelo desenho
            </label>
            <div className="w-32">
              <NumberField label="Espaçamento (px)" value={spacing} min={0} onChange={setSpacing} />
            </div>
          </div>

          <div className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-md bg-muted/40 p-3">
            {filled.length ? (
              <SheetPreview img={sheet.img} maxW={520} maxH={300} />
            ) : (
              <span className="text-xs text-muted-foreground">Adicione frames nas direções à esquerda.</span>
            )}
          </div>

          <table className="text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="font-normal">Direção</th>
                <th className="font-normal">Frames</th>
                <th className="font-normal">Desenho (sem o vazio)</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td className={cn("font-mono", r.frames && r.frames !== maxFrames && "text-warning")}>{r.frames}</td>
                  <td className={cn("font-mono", r.size && r.size.h !== maxHeight && "text-warning")}>
                    {r.size ? `${r.size.w}x${r.size.h}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {warnings.map((w) => (
            <p key={w} className="flex items-center gap-1.5 text-xs text-warning">
              <TriangleAlert className="size-3.5 shrink-0" />
              {w}
            </p>
          ))}

          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">
              {sheet.img.w}x{sheet.img.h} · célula {sheet.cellW}x{sheet.cellH}
            </span>
            <label className="ml-auto flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={withJson} onChange={(e) => setWithJson(e.target.checked)} />
              Salvar JSON com as direções
            </label>
            <Button onClick={exportSheet} disabled={!filled.length}>
              Exportar PNG
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

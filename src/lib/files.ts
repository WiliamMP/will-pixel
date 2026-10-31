// PNG import/export through the native dialogs, shared by the sheet dialogs
import { invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { Img } from "./pixels";
import { PNG_FILTER, decodePng, encodePng } from "./png";

export type Sprite = { name: string; img: Img };

export const baseName = (path: string) => path.split(/[\\/]/).pop()!.replace(/\.png$/i, "");

/** Asks for one or more PNGs and decodes them; files that fail are reported and skipped */
export async function pickPngs(maxSide: number): Promise<Sprite[]> {
  const paths = await open({ filters: PNG_FILTER, multiple: true });
  const out: Sprite[] = [];
  for (const p of paths ?? []) {
    try {
      out.push({ name: baseName(p), img: await decodePng(await invoke<number[]>("read_file", { path: p }), maxSide) });
    } catch (err) {
      toast.error(`${baseName(p)}: ${err}`);
    }
  }
  return out;
}

/** Asks where to save, writes the PNG and, when `json` is given, a .json with the same name next to it */
export async function exportPng(img: Img, defaultName: string, json?: (fileName: string) => unknown) {
  let p = await save({ filters: PNG_FILTER, defaultPath: defaultName });
  if (!p) return;
  if (!/\.png$/i.test(p)) p += ".png";
  try {
    await invoke("write_file", { path: p, bytes: await encodePng(img) });
    if (json) {
      const text = JSON.stringify(json(p.split(/[\\/]/).pop()!), null, 2);
      await invoke("write_file", { path: p.replace(/\.png$/i, ".json"), bytes: Array.from(new TextEncoder().encode(text)) });
    }
    toast.success(`Salvo em ${p}`);
  } catch (err) {
    toast.error(String(err));
  }
}

/** Asks for a folder and writes one PNG per sprite, named after it. Confirms before overwriting. */
export async function exportPngs(sprites: Sprite[]) {
  const dir = await open({ directory: true, title: "Pasta para os PNGs" });
  if (typeof dir !== "string") return;
  const paths = sprites.map((s) => `${dir.replace(/[\\/]$/, "")}\\${s.name}.png`);
  const taken = (await Promise.all(paths.map((path) => invoke<boolean>("exists", { path })))).filter(Boolean).length;
  if (taken && !(await ask(`${taken} arquivo(s) com o mesmo nome já existem nessa pasta e serão substituídos. Continuar?`, { title: "will-pixel", kind: "warning" })))
    return;
  try {
    for (let i = 0; i < sprites.length; i++) await invoke("write_file", { path: paths[i], bytes: await encodePng(sprites[i].img) });
    toast.success(`${sprites.length} PNGs salvos em ${dir}`);
  } catch (err) {
    toast.error(String(err));
  }
}

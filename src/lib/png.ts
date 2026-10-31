// PNG bytes <-> Img through a canvas. The bytes go to Rust (read_file / write_file) as plain number arrays.
import type { Img } from "./pixels";

export const PNG_FILTER = [{ name: "PNG", extensions: ["png"] }];

export const toImageData = (img: Img) => new ImageData(img.data, img.w, img.h);

export async function encodePng(img: Img): Promise<number[]> {
  const c = document.createElement("canvas");
  c.width = img.w;
  c.height = img.h;
  c.getContext("2d")!.putImageData(toImageData(img), 0, 0);
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar o PNG"))), "image/png"),
  );
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

export async function decodePng(bytes: number[], maxSide: number): Promise<Img> {
  const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)]), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  if (bmp.width > maxSide || bmp.height > maxSide)
    throw new Error(`Imagem grande demais (${bmp.width}x${bmp.height}). Máximo ${maxSide}x${maxSide}.`);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
}

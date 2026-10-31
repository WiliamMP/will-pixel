import { useLayoutEffect, useRef } from "react";
import { X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Img } from "@/lib/pixels";
import { toImageData } from "@/lib/png";
import { cn } from "@/lib/utils";

const CHECKER = "repeating-conic-gradient(#7d8294 0 25%, #9aa0b3 0 50%) 0 0 / 16px 16px";

/** Dialog over the editor. Hidden instead of unmounted, so its contents survive closing it. */
export function Modal({
  open,
  title,
  icon: Icon,
  onClose,
  className,
  children,
}: {
  open: boolean;
  title: string;
  icon: LucideIcon;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("fixed inset-0 z-50 place-items-center bg-black/50 p-6", open ? "grid" : "hidden")}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-label={title} className={cn("flex max-h-full max-w-full flex-col rounded-lg border bg-card shadow-2xl", className)}>
        <header className="flex h-10 shrink-0 items-center gap-2 border-b pl-4">
          <Icon className="size-4 text-primary" />
          <span className="flex-1 font-medium">{title}</span>
          <Button variant="ghost" size="icon" aria-label="Fechar" title="Fechar (Esc)" onClick={onClose}>
            <X />
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** A sheet image at the biggest whole-number zoom that fits maxW x maxH */
export function SheetPreview({ img, maxW, maxH }: { img: Img; maxW: number; maxH: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => ref.current?.getContext("2d")!.putImageData(toImageData(img), 0, 0), [img]);
  const scale = Math.max(1, Math.floor(Math.min(maxW / img.w, maxH / img.h)));
  return (
    <canvas
      ref={ref}
      width={img.w}
      height={img.h}
      className="[image-rendering:pixelated]"
      style={{ width: img.w * scale, height: img.h * scale, background: CHECKER }}
    />
  );
}

export function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  return (
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
}

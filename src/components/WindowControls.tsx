import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";

const win = getCurrentWindow();

/** mousedown on an empty part of the title bar drags the window.
 *  `target === currentTarget` skips clicks that started on a button inside it. */
export function dragWindow(e: React.MouseEvent) {
  if (e.button === 0 && e.target === e.currentTarget) win.startDragging();
}

// Minimize / maximize / close for the custom title bar (the window has decorations: false)
export function WindowControls() {
  const btn = "grid w-11 place-items-center text-muted-foreground transition-colors hover:text-foreground";
  return (
    <div className="flex self-stretch">
      <button aria-label="Minimizar" title="Minimizar" className={cn(btn, "hover:bg-muted")} onClick={() => win.minimize()}>
        <Minus className="size-4" />
      </button>
      <button
        aria-label="Maximizar"
        title="Maximizar"
        className={cn(btn, "hover:bg-muted")}
        onClick={() => win.toggleMaximize()}
      >
        <Square className="size-3.5" />
      </button>
      <button
        aria-label="Fechar"
        title="Fechar"
        className={cn(btn, "hover:bg-[#e81123] hover:text-white")}
        onClick={() => win.close()}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

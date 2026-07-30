"use client";

import * as React from "react";
import { BrushIcon, EraserIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fitImageSize, useMaskCanvas, useViewportSize } from "./use-mask-canvas";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    return el.offsetWidth > 0 || el.offsetHeight > 0 || document.activeElement === el;
  });
}

/**
 * 图片编辑器（带 mask），作为独立 Dialog（chat-input 缩略图编辑按钮用）。
 * 双层 canvas 逻辑复用 useMaskCanvas hook。
 * Lightbox 里的编辑模式也走同一个 hook。
 */
export function ImageMaskEditor({
  imageUrl,
  open,
  onOpenChange,
  onEdited,
}: {
  imageUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdited: (newUrl: string) => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const baseCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const mask = useMaskCanvas(baseCanvasRef, maskCanvasRef, imageUrl, open);
  const [prompt, setPrompt] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const viewport = useViewportSize(open);
  const canvasSize = React.useMemo(
    () =>
      fitImageSize(
        mask.imgSize,
        viewport.w > 0
          ? Math.max(1, Math.min(viewport.w * 0.9, 896) - 32)
          : mask.imgSize.w,
        viewport.h > 0 ? Math.max(1, viewport.h * 0.6) : mask.imgSize.h,
        160,
        160
      ),
    [mask.imgSize, viewport]
  );

  React.useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.contains(document.activeElement)) return;
      const firstControl = getFocusableElements(dialog)[0];
      (firstControl ?? dialog).focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open, submitting]);

  const submit = async () => {
    if (!prompt.trim()) { toast.error("请描述要怎么修改"); return; }
    setSubmitting(true);
    try {
      const imageDataUrl = await mask.getImageDataUrl();
      const maskDataUrl = await mask.generateMask();
      const { getDataService } = await import("@/lib/data");
      const data = await getDataService().editImage({
        image: imageDataUrl,
        mask: maskDataUrl,
        prompt: prompt.trim(),
      });
      onEdited(data.url);
      onOpenChange(false);
      toast.success(maskDataUrl ? "局部编辑完成" : "全图编辑完成");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "编辑失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        aria-label="关闭图片编辑器"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => {
          if (!submitting) onOpenChange(false);
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-mask-editor-title"
        tabIndex={-1}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[90vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-y-auto rounded-2xl border bg-card p-0 shadow-xl"
      >
        <div className="px-5 pb-2 pt-4">
          <h2 id="image-mask-editor-title" className="text-lg font-semibold">
            编辑图片
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-y bg-muted/30 px-5 py-2">
          <button aria-label="画笔" onClick={() => mask.setTool("brush")} className={cn("flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors sm:px-2.5", mask.tool === "brush" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
            <BrushIcon className="size-3.5" /> <span className="hidden sm:inline">画笔</span>
          </button>
          <button aria-label="橡皮" onClick={() => mask.setTool("eraser")} className={cn("flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors sm:px-2.5", mask.tool === "eraser" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
            <EraserIcon className="size-3.5" /> <span className="hidden sm:inline">橡皮</span>
          </button>
          <input type="range" min={5} max={60} value={mask.brushSize} onChange={(e) => mask.setBrushSize(Number(e.target.value))} className="w-16 sm:w-24" />
          <span className="text-xs text-muted-foreground tabular-nums">{mask.brushSize}px</span>
          <button aria-label="清除蒙版" onClick={mask.clearMask} className="flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Trash2Icon className="size-3.5" /> <span className="hidden sm:inline">清除</span>
          </button>
          <span className="min-w-0 text-xs text-muted-foreground sm:ml-auto">涂抹要修改的区域，不涂则全图编辑</span>
        </div>
        <div className="flex min-h-0 shrink items-center justify-center bg-neutral-100 p-4 dark:bg-neutral-900">
          <div className="relative" style={{ width: canvasSize.w, height: canvasSize.h }}>
            <canvas ref={baseCanvasRef} className="block rounded-lg" style={{ width: "100%", height: "100%" }} />
            <canvas ref={maskCanvasRef} onPointerDown={mask.startDraw} onPointerMove={mask.draw} onPointerUp={mask.endDraw} onPointerLeave={mask.endDraw} className="absolute inset-0 cursor-crosshair touch-none rounded-lg" style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:items-center">
          <Input placeholder="描述要怎么修改，如：把背景换成蓝色" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !submitting && submit()} className="min-w-0 flex-1" />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 hover:bg-accent hover:text-accent-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              取消
            </button>
            <Button type="button" aria-label="应用图片编辑" onClick={submit} disabled={submitting || !prompt.trim()}>{submitting ? <Loader2Icon className="size-4 animate-spin" /> : "编辑"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

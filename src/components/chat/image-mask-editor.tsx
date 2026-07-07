"use client";

import * as React from "react";
import { BrushIcon, EraserIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fitImageSize, useMaskCanvas, useViewportSize } from "./use-mask-canvas";

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
        viewport.w > 0 ? Math.max(1, Math.min(viewport.w * 0.9, 896) - 32) : mask.imgSize.w,
        viewport.h > 0 ? Math.max(1, viewport.h * 0.6) : mask.imgSize.h
      ),
    [mask.imgSize, viewport]
  );

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="flex max-h-[calc(100dvh-2rem)] w-[90vw] max-w-4xl flex-col gap-0 overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle>编辑图片</DialogTitle>
        </DialogHeader>
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
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
            <Button aria-label="应用图片编辑" onClick={submit} disabled={submitting || !prompt.trim()}>{submitting ? <Loader2Icon className="size-4 animate-spin" /> : "编辑"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

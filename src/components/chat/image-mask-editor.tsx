"use client";

import * as React from "react";
import { BrushIcon, EraserIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMaskCanvas } from "./use-mask-canvas";

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

  const submit = async () => {
    if (!prompt.trim()) { toast.error("请描述要怎么修改"); return; }
    setSubmitting(true);
    try {
      const imageDataUrl = await mask.getImageDataUrl();
      const maskDataUrl = await mask.generateMask();
      const res = await fetch("/api/edit-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl, mask: maskDataUrl, prompt: prompt.trim() }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? `请求失败（${res.status}）`);
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
      <DialogContent hideClose className="max-w-4xl w-[90vw] gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle>编辑图片</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 border-y bg-muted/30 px-5 py-2">
          <button aria-label="画笔" onClick={() => mask.setTool("brush")} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors", mask.tool === "brush" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
            <BrushIcon className="size-3.5" /> 画笔
          </button>
          <button aria-label="橡皮" onClick={() => mask.setTool("eraser")} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors", mask.tool === "eraser" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
            <EraserIcon className="size-3.5" /> 橡皮
          </button>
          <input type="range" min={5} max={60} value={mask.brushSize} onChange={(e) => mask.setBrushSize(Number(e.target.value))} className="w-24" />
          <span className="text-xs text-muted-foreground tabular-nums">{mask.brushSize}px</span>
          <button aria-label="清除蒙版" onClick={mask.clearMask} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Trash2Icon className="size-3.5" /> 清除
          </button>
          <span className="ml-auto text-xs text-muted-foreground">涂抹要修改的区域，不涂则全图编辑</span>
        </div>
        <div className="flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 p-4" style={{ minHeight: 300 }}>
          <div className="relative" style={{ maxWidth: "100%", maxHeight: "60vh" }}>
            <canvas ref={baseCanvasRef} className="block rounded-lg" style={{ maxWidth: "100%", maxHeight: "60vh", width: mask.imgSize.w, height: mask.imgSize.h }} />
            <canvas ref={maskCanvasRef} onPointerDown={mask.startDraw} onPointerMove={mask.draw} onPointerUp={mask.endDraw} onPointerLeave={mask.endDraw} className="absolute inset-0 cursor-crosshair touch-none rounded-lg" style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          <Input placeholder="描述要怎么修改，如：把背景换成蓝色" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !submitting && submit()} className="flex-1" />
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
          <Button aria-label="应用图片编辑" onClick={submit} disabled={submitting || !prompt.trim()}>{submitting ? <Loader2Icon className="size-4 animate-spin" /> : "编辑"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

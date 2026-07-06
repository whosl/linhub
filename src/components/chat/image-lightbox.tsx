"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BrushIcon,
  DownloadIcon,
  EraserIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMaskCanvas } from "./use-mask-canvas";

/**
 * 图片全屏预览 + 编辑（mask）。
 * - 预览模式：大图查看 + 缩放 + 下载
 * - 编辑模式：画笔涂抹 mask + 输入修改指令 + 提交调 /api/edit-image
 */
export function ImageLightbox({
  src,
  alt,
  open,
  onOpenChange,
  onEdited,
}: {
  src: string;
  alt?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑成功，返回新图片 URL */
  onEdited?: (newUrl: string) => void;
}) {
  const [mode, setMode] = React.useState<"preview" | "edit">("preview");
  const [zoom, setZoom] = React.useState(1);
  const [prompt, setPrompt] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const baseCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const mask = useMaskCanvas(baseCanvasRef, maskCanvasRef, src, open && mode === "edit");

  // ESC 关闭
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "edit") setMode("preview");
        else onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, mode, onOpenChange]);

  // 重置状态
  React.useEffect(() => {
    if (open) {
      Promise.resolve().then(() => {
        setMode("preview");
        setZoom(1);
        setPrompt("");
      });
    }
  }, [open, src]);

  const handleDownload = async () => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = alt || src.split("/").pop() || "image.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement("a");
      a.href = src;
      a.download = alt || src.split("/").pop() || "image.png";
      a.target = "_blank";
      a.click();
    }
  };

  const submitEdit = async () => {
    if (!prompt.trim()) {
      toast.error("请描述要怎么修改");
      return;
    }
    if (!onEdited) {
      toast.error("当前上下文不支持编辑");
      return;
    }
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
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm"
          onClick={() => mode === "preview" && onOpenChange(false)}
        >
          {/* ── 顶部工具栏 ── */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            {mode === "preview" ? (
              <>
                {/* 预览模式：缩放 + 下载 + 编辑 + 关闭 */}
                <button
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  aria-label="缩小"
                  className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <ZoomOutIcon className="size-4.5" />
                </button>
                <span className="w-12 text-center text-xs text-white/70 tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  aria-label="放大"
                  className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <ZoomInIcon className="size-4.5" />
                </button>
                <div className="mx-2 h-5 w-px bg-white/20" />
                {onEdited && (
                  <button
                    onClick={() => setMode("edit")}
                    aria-label="编辑图片"
                    className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <PencilIcon className="size-4" /> 编辑
                  </button>
                )}
                <button
                  onClick={handleDownload}
                  aria-label="下载图片"
                  className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
                >
                  <DownloadIcon className="size-4" /> 下载
                </button>
                <button
                  onClick={() => onOpenChange(false)}
                  aria-label="关闭"
                  className="ml-auto flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <XIcon className="size-5" />
                </button>
              </>
            ) : (
              <>
                {/* 编辑模式：画笔工具 */}
                <button
                  onClick={() => mask.setTool("brush")}
                  aria-label="画笔"
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    mask.tool === "brush" ? "bg-primary text-primary-foreground" : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  <BrushIcon className="size-4" /> 画笔
                </button>
                <button
                  onClick={() => mask.setTool("eraser")}
                  aria-label="橡皮"
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    mask.tool === "eraser" ? "bg-primary text-primary-foreground" : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  <EraserIcon className="size-4" /> 橡皮
                </button>
                <input
                  type="range"
                  min={5}
                  max={60}
                  value={mask.brushSize}
                  onChange={(e) => mask.setBrushSize(Number(e.target.value))}
                  className="w-20"
                />
                <span className="text-xs text-white/60 tabular-nums">{mask.brushSize}px</span>
                <button
                  onClick={mask.clearMask}
                  aria-label="清除蒙版"
                  className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
                >
                  <Trash2Icon className="size-4" /> 清除
                </button>
                <button
                  onClick={() => setMode("preview")}
                  aria-label="退出编辑"
                  className="ml-auto flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <XIcon className="size-5" />
                </button>
              </>
            )}
          </div>

          {/* ── 画布/图片区 ── */}
          <div
            className="flex flex-1 items-center justify-center overflow-auto"
            onClick={(e) => mode === "preview" && e.target === e.currentTarget && onOpenChange(false)}
          >
            {mode === "preview" ? (
              <motion.img
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                src={src}
                alt={alt ?? ""}
                style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-2xl transition-transform"
              />
            ) : (
              /* 编辑模式：双层 canvas */
              <div className="relative" style={{ maxWidth: "92vw", maxHeight: "75vh" }} onClick={(e) => e.stopPropagation()}>
                <canvas
                  ref={baseCanvasRef}
                  className="block rounded-lg"
                  style={{ maxWidth: "92vw", maxHeight: "75vh", width: mask.imgSize.w, height: mask.imgSize.h }}
                />
                <canvas
                  ref={maskCanvasRef}
                  onPointerDown={mask.startDraw}
                  onPointerMove={mask.draw}
                  onPointerUp={mask.endDraw}
                  onPointerLeave={mask.endDraw}
                  className="absolute inset-0 cursor-crosshair touch-none rounded-lg"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            )}
          </div>

          {/* ── 编辑模式底部：修改指令 + 提交 ── */}
          {mode === "edit" && (
            <div
              className="flex items-center gap-2 border-t border-white/10 px-4 py-3"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-xs text-white/50">
                涂抹要修改的区域，不涂则全图编辑
              </span>
              <Input
                placeholder="描述要怎么修改，如：把背景换成蓝色"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !submitting && submitEdit()}
                className="flex-1 border-white/20 bg-white/5 text-white placeholder:text-white/40"
              />
              <Button
                onClick={submitEdit}
                disabled={submitting || !prompt.trim()}
                aria-label="应用图片编辑"
              >
                {submitting ? <Loader2Icon className="size-4 animate-spin" /> : "应用编辑"}
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

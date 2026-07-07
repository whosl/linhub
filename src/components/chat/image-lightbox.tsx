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
  const [previewImgSize, setPreviewImgSize] = React.useState({ w: 0, h: 0 });

  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const baseCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const mask = useMaskCanvas(baseCanvasRef, maskCanvasRef, src, open && mode === "edit");
  const previewViewport = useViewportSize(open && mode === "preview");
  const viewport = useViewportSize(open && mode === "edit");
  const previewBaseSize = React.useMemo(
    () =>
      fitImageSize(
        previewImgSize,
        previewViewport.w > 0 ? previewViewport.w * 0.92 : previewImgSize.w,
        previewViewport.h > 0 ? previewViewport.h * 0.82 : previewImgSize.h
      ),
    [previewImgSize, previewViewport]
  );
  const editCanvasSize = React.useMemo(
    () =>
      fitImageSize(
        mask.imgSize,
        viewport.w > 0 ? viewport.w * 0.92 : mask.imgSize.w,
        viewport.h > 0 ? viewport.h * 0.75 : mask.imgSize.h
      ),
    [mask.imgSize, viewport]
  );

  // modal 语义需要把键盘焦点留在图片层内。
  React.useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.contains(document.activeElement)) return;
      const firstControl = getFocusableElements(dialog)[0];
      (firstControl ?? dialog).focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [open, mode]);

  // ESC 与 Tab 圈定需要随预览/编辑模式更新。
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (mode === "edit") setMode("preview");
        else onOpenChange(false);
        return;
      }

      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [open, mode, onOpenChange]);

  // 重置状态
  React.useEffect(() => {
    if (open) {
      Promise.resolve().then(() => {
        setMode("preview");
        setZoom(1);
        setPrompt("");
        setPreviewImgSize({ w: 0, h: 0 });
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
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={mode === "edit" ? "编辑图片" : "图片预览"}
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm"
          onClick={() => mode === "preview" && onOpenChange(false)}
        >
          {/* ── 顶部工具栏 ── */}
          <div
            className="flex flex-wrap items-center gap-2 px-4 py-3"
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
                <div className="mx-2 hidden h-5 w-px bg-white/20 sm:block" />
                {onEdited && (
                  <button
                    onClick={() => setMode("edit")}
                    aria-label="编辑图片"
                    className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:size-auto sm:gap-1.5 sm:px-3.5 sm:py-2"
                  >
                    <PencilIcon className="size-4" /> <span className="hidden sm:inline">编辑</span>
                  </button>
                )}
                <button
                  onClick={handleDownload}
                  aria-label="下载图片"
                  className="flex size-9 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white transition-colors hover:bg-white/20 sm:size-auto sm:gap-1.5 sm:px-3.5 sm:py-2"
                >
                  <DownloadIcon className="size-4" /> <span className="hidden sm:inline">下载</span>
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
                    "flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors sm:px-3",
                    mask.tool === "brush" ? "bg-primary text-primary-foreground" : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  <BrushIcon className="size-4" /> <span className="hidden sm:inline">画笔</span>
                </button>
                <button
                  onClick={() => mask.setTool("eraser")}
                  aria-label="橡皮"
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors sm:px-3",
                    mask.tool === "eraser" ? "bg-primary text-primary-foreground" : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  <EraserIcon className="size-4" /> <span className="hidden sm:inline">橡皮</span>
                </button>
                <input
                  type="range"
                  min={5}
                  max={60}
                  value={mask.brushSize}
                  onChange={(e) => mask.setBrushSize(Number(e.target.value))}
                  className="w-16 sm:w-20"
                />
                <span className="text-xs text-white/60 tabular-nums">{mask.brushSize}px</span>
                <button
                  onClick={mask.clearMask}
                  aria-label="清除蒙版"
                  className="flex h-8 items-center justify-center gap-1 rounded-lg bg-white/10 px-2 text-sm text-white transition-colors hover:bg-white/20 sm:px-2.5"
                >
                  <Trash2Icon className="size-4" /> <span className="hidden sm:inline">清除</span>
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
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
                style={
                  previewImgSize.w > 0 && previewImgSize.h > 0
                    ? {
                        width: Math.round(previewBaseSize.w * zoom),
                        height: Math.round(previewBaseSize.h * zoom),
                      }
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 预览源可能是 blob/data URL 或本地生成图片，不能交给 next/image 优化。 */}
                <img
                  src={src}
                  alt={alt ?? ""}
                  onLoad={(e) =>
                    setPreviewImgSize({
                      w: e.currentTarget.naturalWidth,
                      h: e.currentTarget.naturalHeight,
                    })
                  }
                  className="block size-full max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
                  style={
                    previewImgSize.w > 0 && previewImgSize.h > 0
                      ? { maxWidth: "none", maxHeight: "none" }
                      : undefined
                  }
                />
              </motion.div>
            ) : (
              /* 编辑模式：双层 canvas */
              <div className="relative" style={{ width: editCanvasSize.w, height: editCanvasSize.h }} onClick={(e) => e.stopPropagation()}>
                <canvas
                  ref={baseCanvasRef}
                  className="block rounded-lg"
                  style={{ width: "100%", height: "100%" }}
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
              className="border-t border-white/10 px-4 py-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-xs text-white/50 sm:shrink-0">
                  涂抹要修改的区域，不涂则全图编辑
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Input
                    placeholder="描述要怎么修改，如：把背景换成蓝色"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !submitting && submitEdit()}
                    className="min-w-0 flex-1 border-white/20 bg-white/5 text-white placeholder:text-white/40"
                  />
                  <Button
                    onClick={submitEdit}
                    disabled={submitting || !prompt.trim()}
                    aria-label="应用图片编辑"
                    className="shrink-0"
                  >
                    {submitting ? <Loader2Icon className="size-4 animate-spin" /> : "应用编辑"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

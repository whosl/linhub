"use client";

import * as React from "react";

type ImageSize = { w: number; h: number };

export function fitImageSize(size: ImageSize, maxWidth: number, maxHeight: number) {
  if (size.w <= 0 || size.h <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    return { w: 1, h: 1 };
  }
  const scale = Math.min(1, maxWidth / size.w, maxHeight / size.h);
  return {
    w: Math.max(1, Math.round(size.w * scale)),
    h: Math.max(1, Math.round(size.h * scale)),
  };
}

export function useViewportSize(enabled: boolean) {
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  React.useEffect(() => {
    if (!enabled) return;

    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [enabled]);

  return size;
}

/**
 * Mask 画布逻辑（供 ImageLightbox 和 ImageMaskEditor 共用）。
 * 双层 canvas：底层画原图、上层画笔涂抹。
 * OpenAI mask 规范：透明区(alpha=0)=要编辑的区域。
 */
export function useMaskCanvas(
  baseCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  imageUrl: string,
  open: boolean
) {
  const [brushSize, setBrushSize] = React.useState(20);
  const [tool, setTool] = React.useState<"brush" | "eraser">("brush");
  const [imgSize, setImgSize] = React.useState({ w: 512, h: 512 });
  const drawingRef = React.useRef(false);
  const lastPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const hasDrawnRef = React.useRef(false);

  // 加载原图到底层 canvas
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const maxDim = 1024;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      setImgSize({ w: width, h: height });
      const base = baseCanvasRef.current;
      const mask = maskCanvasRef.current;
      if (!base || !mask) return;
      base.width = width;
      base.height = height;
      mask.width = width;
      mask.height = height;
      const bctx = base.getContext("2d");
      const mctx = mask.getContext("2d");
      if (!bctx || !mctx) return;
      bctx.drawImage(img, 0, 0, width, height);
      mctx.clearRect(0, 0, width, height);
      hasDrawnRef.current = false;
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [open, imageUrl, baseCanvasRef, maskCanvasRef]);

  const getPos = (e: React.PointerEvent) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e: React.PointerEvent) => {
    e.preventDefault();
    maskCanvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPosRef.current = getPos(e);
    draw(e);
  };

  const draw = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const ctx = maskCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    const last = lastPosRef.current ?? pos;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    if (tool === "brush") {
      ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.strokeStyle = "rgba(0, 0, 0, 1)";
      ctx.globalCompositeOperation = "destination-out";
    }
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
    if (tool === "brush") hasDrawnRef.current = true;
  };

  const endDraw = (e: React.PointerEvent) => {
    drawingRef.current = false;
    lastPosRef.current = null;
    try {
      maskCanvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  };

  const canvasToDataUrl = (canvas: HTMLCanvasElement): Promise<string> =>
    new Promise((resolve, reject) =>
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("图片导出失败"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(blob);
      }, "image/png")
    );

  /** 生成 OpenAI 规范 mask（透明=编辑区）。没涂返回 null=全图编辑 */
  const generateMask = async (): Promise<string | null> => {
    const mask = maskCanvasRef.current;
    if (!mask || !hasDrawnRef.current) return null;
    const ctx = mask.getContext("2d");
    if (!ctx) return null;
    const source = ctx.getImageData(0, 0, mask.width, mask.height);
    const imageData = new ImageData(
      new Uint8ClampedArray(source.data),
      source.width,
      source.height
    );
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = alpha > 0 ? 0 : 255;
    }
    const out = document.createElement("canvas");
    out.width = mask.width;
    out.height = mask.height;
    const outCtx = out.getContext("2d");
    if (!outCtx) return null;
    outCtx.putImageData(imageData, 0, 0);
    return canvasToDataUrl(out);
  };

  const getImageDataUrl = async (): Promise<string> => {
    if (!baseCanvasRef.current) throw new Error("画布未初始化");
    return canvasToDataUrl(baseCanvasRef.current);
  };

  return {
    brushSize,
    setBrushSize,
    tool,
    setTool,
    imgSize,
    startDraw,
    draw,
    endDraw,
    clearMask,
    generateMask,
    getImageDataUrl,
    hasDrawn: hasDrawnRef,
  };
}

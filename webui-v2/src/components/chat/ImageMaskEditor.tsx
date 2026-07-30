// 图片遮罩编辑(局部重绘):底图 canvas + 半透明红色笔迹 canvas 叠放
// 提交:底图 dataURL + 黑白遮罩 dataURL(涂抹处白)+ 提示词 → POST /api/edit-image

import { useEffect, useRef, useState } from "react";
import { editImage } from "@/api/images";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { drawStrokes, type MaskStroke } from "@/lib/mask";

/** 底图最长边压缩上限,控制 dataURL 体积 */
const MAX_DIM = 1024;
/** 笔迹颜色(预览用,半透明红) */
const PAINT_COLOR = "rgba(220, 60, 60, 0.45)";

export interface ImageMaskEditorProps {
  open: boolean;
  /** 原图 url */
  src: string;
  onClose: () => void;
  /** 编辑成功:url 已写入消息后由调用方关闭 */
  onComplete: (newUrl: string, prompt: string) => void;
}

export function ImageMaskEditor({
  open,
  src,
  onClose,
  onComplete,
}: ImageMaskEditorProps) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<MaskStroke[]>([]);
  const drawingRef = useRef(false);
  /** 触发重渲染以刷新撤销/清空按钮可用态(笔迹本体在 ref) */
  const [strokeCount, setStrokeCount] = useState(0);
  const [brushSize, setBrushSize] = useState(40);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 打开时重置编辑状态(render 期间随 open 变化调整,避免 effect 里同步 setState)
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setLoading(true);
      setLoadError(null);
      setPrompt("");
      setSubmitting(false);
      setStrokeCount(0);
    }
  }

  const redrawPaint = () => {
    const canvas = paintRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStrokes(ctx, strokesRef.current, PAINT_COLOR);
  };

  // 打开时加载图片并按 MAX_DIM 压缩到 canvas
  useEffect(() => {
    if (!open) return;
    strokesRef.current = [];
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const base = baseRef.current;
      const paint = paintRef.current;
      if (!base || !paint) return;
      base.width = paint.width = w;
      base.height = paint.height = h;
      base.getContext("2d")?.drawImage(img, 0, 0, w, h);
      redrawPaint();
      setLoading(false);
    };
    img.onerror = () => {
      setLoading(false);
      setLoadError("图片加载失败,无法进行局部重绘");
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redrawPaint 为纯渲染辅助
  }, [open, src]);

  /** 指针坐标 → canvas 内部坐标(canvas 可能被 CSS 缩放显示) */
  const toCanvasPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = paintRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (loading || loadError || submitting) return;
    e.preventDefault();
    paintRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokesRef.current.push({ size: brushSize, points: [toCanvasPoint(e)] });
    setStrokeCount(strokesRef.current.length);
    redrawPaint();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (!stroke) return;
    stroke.points.push(toCanvasPoint(e));
    redrawPaint();
  };
  const onPointerUp = () => {
    drawingRef.current = false;
  };

  const undo = () => {
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redrawPaint();
  };
  const clearAll = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    redrawPaint();
  };

  const submit = async () => {
    const text = prompt.trim();
    if (!text) {
      toast.error("请输入重绘提示词");
      return;
    }
    if (strokesRef.current.length === 0) {
      toast.error("请先用画笔涂抹要重绘的区域");
      return;
    }
    const base = baseRef.current;
    const paint = paintRef.current;
    if (!base || !paint) return;

    let imageDataUrl: string;
    let maskDataUrl: string;
    try {
      imageDataUrl = base.toDataURL("image/png");
      // 遮罩:黑底,笔迹白色,与底图同尺寸
      const mask = document.createElement("canvas");
      mask.width = base.width;
      mask.height = base.height;
      const ctx = mask.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, mask.width, mask.height);
      drawStrokes(ctx, strokesRef.current, "#fff");
      maskDataUrl = mask.toDataURL("image/png");
    } catch {
      toast.error("图片跨域受限,无法导出编辑内容");
      return;
    }

    setSubmitting(true);
    try {
      const res = await editImage({ image: imageDataUrl, mask: maskDataUrl, prompt: text });
      toast.success("图片已更新");
      onComplete(res.url, text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "图片编辑失败,请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title="局部重绘"
      widthClassName="max-w-2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-sm text-text-2 hover:bg-surface-2 disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || loading || !!loadError}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-40"
          >
            开始重绘
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-3">
          用画笔涂抹要重绘的区域,再描述希望替换成什么。
        </p>

        {/* 画布区(canvas 常驻,加载/失败态用覆盖层展示) */}
        <div className="relative flex min-h-40 items-center justify-center rounded-xl border border-border bg-surface-2/50 p-2">
          <div
            className={cn(
              "relative inline-block leading-none",
              (loading || loadError) && "invisible",
            )}
          >
            <canvas
              ref={baseRef}
              className="max-h-[48vh] max-w-full rounded-lg"
            />
            <canvas
              ref={paintRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="absolute inset-0 size-full cursor-crosshair touch-none rounded-lg"
            />
          </div>
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-text-3">
              <Spinner className="size-4" /> 图片加载中…
            </span>
          )}
          {!loading && loadError && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-danger">
              {loadError}
            </p>
          )}
        </div>

        {/* 画笔工具行 */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-2">
          <label className="flex items-center gap-2">
            画笔
            <input
              type="range"
              min={10}
              max={100}
              step={2}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-28 accent-primary"
            />
            <span className="w-8 text-text-3">{brushSize}px</span>
          </label>
          <button
            type="button"
            onClick={undo}
            disabled={strokeCount === 0 || submitting}
            className="rounded-md border border-border px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
          >
            撤销一笔
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={strokeCount === 0 || submitting}
            className="rounded-md border border-border px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
          >
            清空
          </button>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="描述重绘效果,例如:把涂抹区域换成蓝天白云"
          className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-text-3 focus:border-primary/50"
        />

        {submitting && (
          <p className="flex items-center gap-2 text-xs text-text-2">
            <Spinner className="size-3.5" />
            正在编辑图片,可能需要 1-2 分钟,请勿关闭窗口…
          </p>
        )}
      </div>
    </Dialog>
  );
}

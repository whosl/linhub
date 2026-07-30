// 遮罩画笔的纯几何逻辑:把若干笔(点序列 + 笔宽)绘制到任意 2D 上下文
// 抽成纯函数便于 node 单测(用 mock ctx 断言调用序列)

export interface MaskPoint {
  x: number;
  y: number;
}

export interface MaskStroke {
  /** 画笔直径(canvas 像素) */
  size: number;
  points: MaskPoint[];
}

/** drawStrokes 需要的最小 2D 上下文接口(CanvasRenderingContext2D 天然满足) */
export interface StrokeContext {
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  stroke(): void;
  fill(): void;
}

/**
 * 把笔迹绘制到 ctx(指定颜色)。
 * 多点笔画 = 圆头折线;单点笔画 = 圆点(arc 填充)。
 */
export function drawStrokes(
  ctx: StrokeContext,
  strokes: MaskStroke[],
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    ctx.lineWidth = stroke.size;
    if (stroke.points.length === 1) {
      const p = stroke.points[0]!;
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i]!.x, stroke.points[i]!.y);
    }
    ctx.stroke();
  }
}

// 遮罩画笔纯函数单测:drawStrokes 的调用序列(折线 / 圆点 / 颜色 / 笔宽)
// 运行:node scripts/test-mask.mjs(自动用 esbuild 编译)

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "node_modules/.tmp");
execFileSync(join(root, "node_modules/.bin/esbuild"), [
  join(root, "src/lib/mask.ts"),
  "--format=esm",
  `--outfile=${join(outDir, "mask.test.mjs")}`,
]);

const { drawStrokes } = await import(join(outDir, "mask.test.mjs"));

/** mock 2D ctx:记录全部调用与属性赋值 */
function mockCtx() {
  const calls = [];
  return {
    calls,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (x, y) => calls.push(["moveTo", x, y]),
    lineTo: (x, y) => calls.push(["lineTo", x, y]),
    arc: (x, y, r, s, e) => calls.push(["arc", x, y, r, s, e]),
    stroke: () => calls.push(["stroke"]),
    fill: () => calls.push(["fill"]),
  };
}

// --- 1. 多点笔画 = 圆头折线 ---
{
  const ctx = mockCtx();
  drawStrokes(
    ctx,
    [{ size: 20, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] }],
    "#fff",
  );
  assert.equal(ctx.strokeStyle, "#fff");
  assert.equal(ctx.lineWidth, 20);
  assert.equal(ctx.lineCap, "round");
  assert.equal(ctx.lineJoin, "round");
  assert.deepEqual(ctx.calls, [
    ["beginPath"],
    ["moveTo", 1, 2],
    ["lineTo", 3, 4],
    ["lineTo", 5, 6],
    ["stroke"],
  ]);
  console.log("✓ 多点笔画:圆头折线,坐标与笔宽正确");
}

// --- 2. 单点笔画 = 圆点(arc + fill) ---
{
  const ctx = mockCtx();
  drawStrokes(ctx, [{ size: 30, points: [{ x: 10, y: 20 }] }], "#fff");
  assert.deepEqual(ctx.calls, [
    ["beginPath"],
    ["arc", 10, 20, 15, 0, Math.PI * 2],
    ["fill"],
  ]);
  console.log("✓ 单点笔画:半径 = 笔宽一半的圆点填充");
}

// --- 3. 多笔 + 空笔跳过 + 颜色切换(预览红 / 遮罩白) ---
{
  const ctx = mockCtx();
  drawStrokes(
    ctx,
    [
      { size: 10, points: [] },
      { size: 10, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { size: 40, points: [{ x: 2, y: 2 }, { x: 3, y: 3 }] },
    ],
    "rgba(220, 60, 60, 0.45)",
  );
  assert.equal(ctx.strokeStyle, "rgba(220, 60, 60, 0.45)");
  assert.equal(ctx.calls.filter(([c]) => c === "stroke").length, 2);
  assert.equal(ctx.lineWidth, 40); // 最后一笔的宽度
  console.log("✓ 多笔绘制:空笔跳过,每笔独立 beginPath/stroke");
}

console.log("\n全部通过 ✔");

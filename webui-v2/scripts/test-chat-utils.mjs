// 聊天工具类纯函数单测:工具名映射 + WorkProcessSummary 汇总
// 运行:node scripts/test-chat-utils.mjs(自动用 esbuild 编译)

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "node_modules/.tmp");
execFileSync(join(root, "node_modules/.bin/esbuild"), [
  join(root, "src/lib/tool-names.ts"),
  "--format=esm",
  `--outfile=${join(outDir, "tool-names.test.mjs")}`,
]);
execFileSync(join(root, "node_modules/.bin/esbuild"), [
  join(root, "src/lib/tool-summary.ts"),
  "--bundle",
  "--format=esm",
  `--outfile=${join(outDir, "tool-summary.test.mjs")}`,
]);

const { toolDisplayName } = await import(join(outDir, "tool-names.test.mjs"));
const { summarizeToolCalls, formatToolSummary } = await import(
  join(outDir, "tool-summary.test.mjs")
);

// --- 1. 工具名映射 ---
{
  assert.equal(toolDisplayName("web_search"), "联网搜索");
  assert.equal(toolDisplayName("web_read"), "读取网页");
  assert.equal(toolDisplayName("generate_image"), "生成图片");
  assert.equal(toolDisplayName("edit_image"), "编辑图片");
  assert.equal(toolDisplayName("analyze_image"), "分析图片");
  assert.equal(toolDisplayName("run_code"), "运行代码");
  assert.equal(toolDisplayName("save_memory"), "保存记忆");
  assert.equal(toolDisplayName("search_memory"), "搜索记忆");
  assert.equal(toolDisplayName("search_knowledge"), "搜索知识库");
  assert.equal(toolDisplayName("create_artifact"), "创建 Artifact");
  assert.equal(toolDisplayName("update_artifact"), "更新 Artifact");
  console.log("✓ toolDisplayName:内置工具中文映射正确");
}

// --- 2. tavily_* 与 MCP 原样 ---
{
  assert.equal(toolDisplayName("tavily_search"), "Tavily");
  assert.equal(toolDisplayName("tavily_extract"), "Tavily");
  assert.equal(toolDisplayName("github_create_issue"), "github_create_issue");
  console.log("✓ toolDisplayName:tavily_* → Tavily,其余原样");
}

// --- 3. 汇总:计数、顺序、running / error ---
{
  const tc = (id, toolName, state) => ({
    type: "tool-call",
    toolCallId: id,
    toolName,
    state,
  });
  const parts = [
    { type: "text", text: "先搜索" },
    tc("1", "web_search", "success"),
    tc("2", "web_search", "success"),
    { type: "reasoning", text: "想一下" },
    tc("3", "run_code", "running"),
    tc("4", "generate_image", "error"),
  ];
  const s = summarizeToolCalls(parts);
  assert.equal(s.total, 4);
  assert.equal(s.running, true);
  assert.deepEqual(
    s.entries.map((e) => [e.label, e.count, e.hasError]),
    [
      ["联网搜索", 2, false],
      ["运行代码", 1, false],
      ["生成图片", 1, true],
    ],
  );
  assert.equal(
    formatToolSummary(s),
    "联网搜索 ×2、运行代码 ×1、生成图片 ×1",
  );
  console.log("✓ summarizeToolCalls / formatToolSummary:计数、顺序、状态正确");
}

// --- 4. 空 parts / 无工具调用 ---
{
  const s = summarizeToolCalls([{ type: "text", text: "纯文本" }]);
  assert.equal(s.total, 0);
  assert.equal(s.running, false);
  assert.equal(formatToolSummary(s), "");
  console.log("✓ summarizeToolCalls:无工具调用返回空汇总");
}

console.log("\n全部通过 ✔");

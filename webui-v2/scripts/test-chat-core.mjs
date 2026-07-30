// chat-core 纯函数单测:消息树遍历 + 流事件应用
// 运行:node scripts/test-chat-core.mjs(自动用 esbuild 编译 src/stores/chat-core.ts)

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "node_modules/.tmp/chat-core.test.mjs");
execFileSync(join(root, "node_modules/.bin/esbuild"), [
  join(root, "src/stores/chat-core.ts"),
  "--format=esm",
  `--outfile=${out}`,
]);

const { visibleThread, deepestLeaf, siblingBranches, applyEvent } = await import(out);

let ts = 0;
const at = () => new Date(1_700_000_000_000 + ts++ * 1000).toISOString();
const msg = (id, parentId, role = "user", parts = [{ type: "text", text: id }]) => ({
  id,
  conversationId: "c1",
  parentId,
  role,
  parts,
  createdAt: at(),
  status: "complete",
});
const session = (messages, extra = {}) => ({
  conversationId: "c1",
  messages,
  status: "idle",
  loaded: true,
  ...extra,
});

// --- 1. 线性链 ---
{
  const m1 = msg("m1", null);
  const m2 = msg("m2", "m1", "assistant");
  const m3 = msg("m3", "m2");
  const thread = visibleThread([m1, m2, m3], "m3");
  assert.deepEqual(thread.map((m) => m.id), ["m1", "m2", "m3"]);
  console.log("✓ visibleThread:线性链回溯正确");
}

// --- 2. 分支:deepestLeaf 取最新叶子;visibleThread 沿指定分支 ---
{
  const m1 = msg("m1", null);
  const m2a = msg("m2a", "m1", "assistant");
  const m2b = msg("m2b", "m1", "assistant"); // 更新,是新分支
  const messages = [m1, m2a, m2b];
  assert.equal(deepestLeaf(messages), "m2b");
  assert.deepEqual(visibleThread(messages).map((m) => m.id), ["m1", "m2b"]);
  assert.deepEqual(visibleThread(messages, "m2a").map((m) => m.id), ["m1", "m2a"]);
  assert.deepEqual(siblingBranches(messages, "m2a").map((m) => m.id), ["m2a", "m2b"]);
  // 从 m1 出发沿最新子节点走到底
  assert.equal(deepestLeaf(messages, "m1"), "m2b");
  console.log("✓ 分支:deepestLeaf / visibleThread / siblingBranches 正确");
}

// --- 3. receipt 不参与链,但按 createdAt 插入 ---
{
  const m1 = msg("m1", null);
  const receipt = msg("r1", "m1", "skill-run-receipt", [
    { type: "skill-run-receipt", runId: "run1", runAttempt: 1 },
  ]);
  const m2 = msg("m2", "m1", "assistant");
  // 手动排时间:m1 < receipt < m2
  m1.createdAt = "2024-01-01T00:00:00.000Z";
  receipt.createdAt = "2024-01-01T00:00:01.000Z";
  m2.createdAt = "2024-01-01T00:00:02.000Z";
  const messages = [m1, receipt, m2];
  // receipt 不算子节点:m2 的 parent 是 m1,叶子仍是 m2
  assert.equal(deepestLeaf(messages), "m2");
  const thread = visibleThread(messages, "m2");
  assert.deepEqual(thread.map((m) => m.id), ["m1", "r1", "m2"]);
  console.log("✓ receipt:不入链、不算子节点,按 createdAt 插入展示");
}

// --- 4. text-delta 追加 / reasoning-delta / reasoning-done ---
{
  const a = msg("a1", "m1", "assistant", []);
  const s = session([a], { status: "streaming", streamingMessageId: "a1" });
  applyEvent(s, { type: "text-delta", messageId: "a1", delta: "你好" });
  applyEvent(s, { type: "text-delta", messageId: "a1", delta: ",世界" });
  assert.deepEqual(a.parts, [{ type: "text", text: "你好,世界" }]);
  applyEvent(s, { type: "reasoning-delta", messageId: "a1", delta: "想一下" });
  applyEvent(s, { type: "reasoning-delta", messageId: "a1", delta: "再想想" });
  assert.deepEqual(a.parts[1], { type: "reasoning", text: "想一下再想想" });
  // reasoning 之后再来 text-delta:新开一个 text part
  applyEvent(s, { type: "text-delta", messageId: "a1", delta: "结论" });
  assert.equal(a.parts.length, 3);
  assert.deepEqual(a.parts[2], { type: "text", text: "结论" });
  applyEvent(s, { type: "reasoning-done", messageId: "a1", durationMs: 1200 });
  assert.equal(a.parts[1].durationMs, 1200);
  console.log("✓ applyEvent:text/reasoning delta 追加与 reasoning-done 正确");
}

// --- 5. 快照防回退 ---
{
  const longText = "这是本地已经累积的很长很长的一段流式文本,不能被快照回退掉";
  const a = msg("a1", "m1", "assistant", [{ type: "text", text: longText }]);
  a.status = "streaming";
  const s = session([a]);
  applyEvent(s, {
    type: "assistant-snapshot",
    message: { ...a, parts: [{ type: "text", text: "短" }], status: "streaming" },
  });
  assert.equal(a.parts[0].text, longText); // parts 保留
  // 快照更长:全量替换
  applyEvent(s, {
    type: "assistant-snapshot",
    message: {
      ...a,
      parts: [{ type: "text", text: longText + longText }],
      status: "complete",
      usage: { inputTokens: 1, outputTokens: 2, costCents: 3 },
    },
  });
  assert.equal(a.parts[0].text, longText + longText);
  assert.equal(a.status, "complete");
  assert.equal(a.usage.costCents, 3);
  console.log("✓ applyEvent:assistant-snapshot 防回退正确");
}

// --- 6. tool-call:upsert + inputPreview 累加 + end 合并不丢 inputPreview ---
{
  const a = msg("a1", "m1", "assistant", []);
  const s = session([a]);
  applyEvent(s, {
    type: "tool-input-start",
    messageId: "a1",
    toolCallId: "tc1",
    toolName: "web_search",
  });
  applyEvent(s, { type: "tool-input-delta", messageId: "a1", toolCallId: "tc1", delta: '{"q":' });
  applyEvent(s, { type: "tool-input-delta", messageId: "a1", toolCallId: "tc1", delta: '"x"}' });
  applyEvent(s, {
    type: "tool-call-end",
    messageId: "a1",
    part: { type: "tool-call", toolCallId: "tc1", toolName: "web_search", state: "success" },
  });
  assert.equal(a.parts.length, 1);
  assert.equal(a.parts[0].state, "success");
  assert.equal(a.parts[0].inputPreview, '{"q":"x"}'); // 累加结果未被 end 覆盖
  console.log("✓ applyEvent:tool-call upsert 与 inputPreview 累加正确");
}

// --- 7. routing-decision 写入 user 消息的 tool-config part ---
{
  const u = msg("u1", null, "user", [
    { type: "text", text: "查一下" },
    { type: "tool-config", tools: { webSearch: true, imageGeneration: false, codeRunner: false, knowledgeSearch: false, mcpServerIds: [], knowledgeBaseIds: [] } },
  ]);
  const s = session([u]);
  const decision = { enabled: true, source: "model", labels: ["联网搜索"] };
  applyEvent(s, { type: "routing-decision", messageId: "u1", decision });
  assert.deepEqual(u.parts[1].routing, decision);
  console.log("✓ applyEvent:routing-decision 写入 tool-config part");
}

// --- 8. done / error 收口 ---
{
  const a = msg("a1", "m1", "assistant", [{ type: "text", text: "hi" }]);
  a.status = "streaming";
  const s = session([a], { status: "streaming", streamingMessageId: "a1" });
  applyEvent(s, {
    type: "done",
    messageId: "a1",
    status: "complete",
    usage: { inputTokens: 10, outputTokens: 5, costCents: 1 },
  });
  assert.equal(a.status, "complete");
  assert.equal(a.usage.outputTokens, 5);
  assert.equal(s.status, "idle");
  assert.equal(s.streamingMessageId, undefined);

  applyEvent(s, { type: "error", messageId: "a1", message: "上游超时" });
  assert.equal(s.streamError, "上游超时");
  assert.equal(a.status, "error");
  console.log("✓ applyEvent:done/error 状态收口正确");
}

// --- 9. conversation-created → pendingRedirect 回调 ---
{
  const s = session([]);
  let redirect = null;
  applyEvent(
    s,
    { type: "conversation-created", conversation: { id: "c-real" } },
    { setPendingRedirect: (id) => (redirect = id) },
  );
  assert.equal(redirect, "c-real");
  console.log("✓ applyEvent:conversation-created 触发 pendingRedirect");
}

console.log("\nchat-core 纯函数测试全部通过");

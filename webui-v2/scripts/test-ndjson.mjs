// NDJSON 解析器单测:跨 chunk 残行拼合、多字节字符截断、尾部无换行残行
// 运行:node scripts/test-ndjson.mjs(自动用 esbuild 编译 src/api/ndjson.ts)

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "node_modules/.tmp/ndjson.test.mjs");
execFileSync(join(root, "node_modules/.bin/esbuild"), [
  join(root, "src/api/ndjson.ts"),
  "--format=esm",
  `--outfile=${out}`,
]);

const { createNdjsonParser, streamNdjson } = await import(out);

// --- createNdjsonParser:任意切分的字节流 ---
{
  const events = [];
  const parser = createNdjsonParser((e) => events.push(e));
  const encoder = new TextEncoder();
  const lines = [
    JSON.stringify({ type: "text-delta", messageId: "m1", delta: "你好" }),
    JSON.stringify({ type: "ping" }),
    "", // 空行应被忽略
    JSON.stringify({ type: "done", messageId: "m1", status: "complete" }),
  ];
  // 拼成一个 buffer 后按随机小片切分(会把多字节字符切断)
  const full = encoder.encode(lines.join("\n") + "\n");
  for (let i = 0; i < full.length; i += 3) {
    parser.push(full.slice(i, i + 3));
  }
  parser.end();
  assert.equal(events.length, 3);
  assert.equal(events[0].delta, "你好");
  assert.equal(events[1].type, "ping");
  assert.equal(events[2].status, "complete");
  console.log("✓ createNdjsonParser:跨 chunk 残行与多字节字符拼合正确");
}

// --- createNdjsonParser:末尾无换行的残行由 end() 冲刷 ---
{
  const events = [];
  const parser = createNdjsonParser((e) => events.push(e));
  parser.push(new TextEncoder().encode('{"type":"ping"}')); // 无 \n
  assert.equal(events.length, 0);
  parser.end();
  assert.equal(events.length, 1);
  console.log("✓ createNdjsonParser:end() 冲刷尾部残行");
}

// --- streamNdjson:ReadableStream 逐行产出 ---
{
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('{"type":"assistant-start","message":{"id":"m1"}}\n{"type":"text-d'),
    encoder.encode('elta","messageId":"m1","delta":"he'),
    encoder.encode('llo"}\n{"type":"done","messageId":"m1","status":"complete"}\n'),
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const response = new Response(stream, { status: 200 });
  const events = [];
  for await (const e of streamNdjson(response)) events.push(e);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.type), [
    "assistant-start",
    "text-delta",
    "done",
  ]);
  assert.equal(events[1].delta, "hello");
  console.log("✓ streamNdjson:跨 chunk NDJSON 逐行解析正确");
}

// --- streamNdjson:非 2xx 读 JSON 错误抛错 ---
{
  const response = new Response(JSON.stringify({ error: "余额不足" }), {
    status: 402,
  });
  await assert.rejects(
    async () => {
      for await (const _ of streamNdjson(response)) void _;
    },
    (err) => err.message === "余额不足",
  );
  console.log("✓ streamNdjson:非 2xx 提取 error 字段抛错");
}

console.log("\nNDJSON 解析器测试全部通过");

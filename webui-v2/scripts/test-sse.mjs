// SSE 解析器单测:跨 chunk 残块拼合、event/data 行、多行 data、注释行、CRLF、尾部无空行残块
// 运行:node scripts/test-sse.mjs(自动用 esbuild 编译 src/api/sse.ts)

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "node_modules/.tmp/sse.test.mjs");
execFileSync(join(root, "node_modules/.bin/esbuild"), [
  join(root, "src/api/sse.ts"),
  "--format=esm",
  `--outfile=${out}`,
]);

const { createSseParser, streamSse } = await import(out);

// --- createSseParser:按 \n\n 分块 + 跨 chunk 残块拼合(含多字节字符被切断) ---
{
  const events = [];
  const parser = createSseParser((e) => events.push(e));
  const text =
    'event: snapshot\ndata: {"status":"running","label":"你好"}\n\n' +
    "event: run-event\ndata: {}\n\n" +
    ": 这是注释行,应忽略\n\n" + // 纯注释块不下发
    "data: 无 event 行,缺省 message\n\n";
  const full = new TextEncoder().encode(text);
  for (let i = 0; i < full.length; i += 5) {
    parser.push(full.slice(i, i + 5));
  }
  parser.end();
  assert.equal(events.length, 3);
  assert.equal(events[0].event, "snapshot");
  assert.deepEqual(JSON.parse(events[0].data), { status: "running", label: "你好" });
  assert.equal(events[1].event, "run-event");
  assert.equal(events[2].event, "message");
  assert.equal(events[2].data, "无 event 行,缺省 message");
  console.log("✓ createSseParser:分块 / 跨 chunk 残块 / 注释行 / 缺省 event 正确");
}

// --- createSseParser:多行 data 用 \n 连接、data: 后单空格去除 ---
{
  const events = [];
  const parser = createSseParser((e) => events.push(e));
  parser.push(new TextEncoder().encode("data: 第一行\ndata:第二行\ndata:  保留多余空格\n\n"));
  parser.end();
  assert.equal(events.length, 1);
  assert.equal(events[0].data, "第一行\n第二行\n 保留多余空格");
  console.log("✓ createSseParser:多行 data 拼接与值前导空格处理正确");
}

// --- createSseParser:CRLF 行尾兼容 ---
{
  const events = [];
  const parser = createSseParser((e) => events.push(e));
  parser.push(new TextEncoder().encode("event: ping\r\ndata: {}\r\n\r\n"));
  parser.end();
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "ping");
  console.log("✓ createSseParser:CRLF 分块正确");
}

// --- createSseParser:流末尾无空行收尾的残块由 end() 冲刷 ---
{
  const events = [];
  const parser = createSseParser((e) => events.push(e));
  parser.push(new TextEncoder().encode("event: snapshot\ndata: {\"a\":1}"));
  assert.equal(events.length, 0);
  parser.end();
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "snapshot");
  console.log("✓ createSseParser:end() 冲刷尾部残块");
}

// --- streamSse:ReadableStream 逐块产出 ---
{
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode("event: snapshot\ndata: {\"status\":\"run"),
    encoder.encode('ning\"}\n\nevent: run-event\nda'),
    encoder.encode("ta: {}\n\nevent: ping\ndata: {}\n\n"),
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const response = new Response(stream, { status: 200 });
  const events = [];
  for await (const e of streamSse(response)) events.push(e);
  assert.deepEqual(
    events.map((e) => e.event),
    ["snapshot", "run-event", "ping"],
  );
  assert.equal(JSON.parse(events[0].data).status, "running");
  console.log("✓ streamSse:跨 chunk SSE 逐块解析正确");
}

// --- streamSse:非 2xx 读 JSON 错误抛错 ---
{
  const response = new Response(JSON.stringify({ error: "未登录" }), { status: 401 });
  await assert.rejects(
    async () => {
      for await (const _ of streamSse(response)) void _;
    },
    (err) => err.message === "未登录",
  );
  console.log("✓ streamSse:非 2xx 提取 error 字段抛错");
}

console.log("\nSSE 解析器测试全部通过");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../src/app/api/chat/route.ts", import.meta.url), "utf8");
const registry = await readFile(
  new URL("../src/lib/server/chat-task-registry.ts", import.meta.url),
  "utf8"
);
const nginx = await readFile(
  new URL("../deploy/nginx/linhub-proxy.conf", import.meta.url),
  "utf8"
);

assert.match(route, /export const maxDuration = 1800;/);
assert.match(route, /const MAX_TOOL_STEPS = 200;/);
assert.match(route, /stepCountIs\(MAX_TOOL_STEPS\)/);
assert.match(registry, /PENDING_GENERATION_STALE_MS = 1_800_000;/);
assert.match(nginx, /proxy_read_timeout 1860s;/);
assert.match(nginx, /proxy_send_timeout 1860s;/);
assert.match(nginx, /send_timeout 1860s;/);

console.log("聊天上限验证通过：1800 秒、200 步、Nginx 1860 秒");

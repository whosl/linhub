import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const PORT = Number(process.env.IMAGE_EDIT_TEST_PORT ?? 3109);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_URL =
  process.env.IMAGE_EDIT_TEST_DATABASE_URL ??
  "postgres://linhub:linhub_dev_password@127.0.0.1:5433/linhub";
const database = new URL(DATABASE_URL);
if (!["127.0.0.1", "localhost", "::1"].includes(database.hostname)) {
  throw new Error("图片编辑集成验证只允许连接本机数据库");
}
if (database.port !== "5433") {
  throw new Error("图片编辑集成验证只允许使用本机 Compose 端口 5433");
}

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = `image-edit-test-${suffix}`;
const sessionToken = `image-edit-session-${randomUUID()}`;
const operationKey = `integration-${randomUUID()}`;
const conversationId = `conv-${suffix}`;
const messageId = `msg-${suffix}`;
const oldUrl = `/api/media/old-${suffix}`;
const TEST_ENCRYPTION_KEY = "11".repeat(32);
const TEST_AUTH_SECRET = "image-edit-route-test-secret-at-least-32-chars";
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
process.env.BETTER_AUTH_SECRET = TEST_AUTH_SECRET;
const { imageEditAssetId } = await import(
  "../src/lib/server/image-edit-idempotency.ts"
);
const assetId = imageEditAssetId(userId, operationKey);
const newUrl = `/api/media/${assetId}`;
const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });
let server = null;

try {
  await sql`
    insert into users (id, name, email, email_verified, role, balance_cents)
    values (
      ${userId},
      'Image Edit Route Test',
      ${`${userId}@linhub.invalid`},
      false,
      'user',
      300
    )
  `;
  await sql`
    insert into sessions (id, user_id, token, expires_at)
    values (
      ${`session-${suffix}`},
      ${userId},
      ${sessionToken},
      ${new Date(Date.now() + 60 * 60 * 1000)}
    )
  `;
  await sql`
    insert into conversations (id, owner_id, title, model_id)
    values (${conversationId}, ${userId}, 'Image Edit Route Test', 'test-model')
  `;
  await sql`
    insert into messages (id, conversation_id, role, parts)
    values (
      ${messageId},
      ${conversationId},
      'assistant',
      ${sql.json([{ type: "image", url: oldUrl }])}
    )
  `;
  await sql`
    insert into media_assets (
      id, owner_id, kind, name, mime_type, size, storage_key, source_tool
    ) values (
      ${assetId},
      ${userId},
      'edited',
      'edited.png',
      'image/png',
      1,
      ${`data/media/${userId}/${assetId}.png`},
      'edit_image'
    )
  `;

  server = spawn("npm", ["run", "dev", "--", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-8_000);
  });
  server.stderr.on("data", (chunk) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-8_000);
  });
  await waitForServer(server, () => serverOutput);

  const before = await billingCounts();
  const lookup = await imageEditRequest("GET");
  assert(lookup.status === 200 && lookup.body.url === newUrl, "GET 未恢复既有编辑结果");

  const replays = await Promise.all(
    Array.from({ length: 32 }, () => imageEditRequest("POST"))
  );
  assert(replays.every((item) => item.status === 200), "同键 POST 重放未全部成功");
  assert(replays.every((item) => item.body.url === newUrl), "同键 POST 返回了不同媒体");
  const afterReplay = await billingCounts();
  assert(
    afterReplay.usage === before.usage && afterReplay.ledger === before.ledger,
    "已有结果重放产生了额外计费"
  );

  const firstPatch = await replaceMessageImage();
  const replayPatch = await replaceMessageImage();
  assert(firstPatch.status === 200, "首次消息图片关联失败");
  assert(
    replayPatch.status === 200 && replayPatch.body.alreadyApplied === true,
    "消息图片 PATCH 重放未被识别为已应用"
  );
  const [message] = await sql`
    select parts from messages where id = ${messageId}
  `;
  assert(
    message?.parts?.some((part) => part.type === "image" && part.url === newUrl),
    "消息未保存编辑后的图片 URL"
  );

  console.log(JSON.stringify({
    resultLookup: { status: lookup.status, url: lookup.body.url },
    postReplay: { requests: replays.length, uniqueAsset: true, extraUsage: 0 },
    patchReplay: { first: firstPatch.status, replay: replayPatch.body.alreadyApplied },
  }));
} finally {
  if (server && server.exitCode === null) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (server.exitCode === null) {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {}
    }
  }
  await sql`delete from users where id = ${userId}`.catch(() => {});
  await sql.end({ timeout: 5 });
}

async function imageEditRequest(method) {
  const response = await fetch(`${BASE_URL}/api/edit-image`, {
    method,
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": operationKey,
    },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
  return { status: response.status, body: await response.json() };
}

async function replaceMessageImage() {
  const response = await fetch(`${BASE_URL}/api/messages/${messageId}/image`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ oldUrl, newUrl, editPrompt: "integration replay" }),
  });
  return { status: response.status, body: await response.json() };
}

async function billingCounts() {
  const [usage] = await sql`
    select count(*)::int as count from usage_records where user_id = ${userId}
  `;
  const [ledger] = await sql`
    select count(*)::int as count from ledger where user_id = ${userId}
  `;
  return { usage: usage.count, ledger: ledger.count };
}

async function waitForServer(child, getOutput) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`测试服务器提前退出\n${getOutput()}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/api/models`);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待测试服务器超时\n${getOutput()}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import postgres from "postgres";

const PORT = Number(process.env.BILLING_TEST_PORT ?? 3107);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_URL =
  process.env.BILLING_TEST_DATABASE_URL ??
  "postgres://linhub:linhub_dev_password@127.0.0.1:5433/linhub";
const database = new URL(DATABASE_URL);

if (!["127.0.0.1", "localhost", "::1"].includes(database.hostname)) {
  throw new Error("计费集成验证只允许连接本机数据库");
}
if (database.port !== "5433") {
  throw new Error("计费集成验证只允许使用本机 Compose 端口 5433");
}

const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userEmail = `billing-idempotency-${suffix}@linhub.invalid`;
const sessionToken = `billing-test-${randomUUID()}`;
const redeemCode = `INT-${suffix.toUpperCase()}-A`;
const rollbackCode = `INT-${suffix.toUpperCase()}-B`;
const triggerName = `billing_test_fail_${suffix}`;
const functionName = `billing_test_fail_${suffix}`;
let userId = null;
let server = null;

try {
  userId = `billing-test-${suffix}`;
  await sql`
    insert into users (id, name, email, email_verified, role, balance_cents)
    values (${userId}, 'Billing Idempotency Test', ${userEmail}, false, 'user', 300)
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

  server = spawn("npm", ["run", "dev", "--", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      PAYMENT_MOCK_ENABLED: "true",
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

  const token = sessionToken;
  const users = await sql`select id, balance_cents from users where email = ${userEmail}`;
  assert(users.length === 1, "临时用户未写入数据库");
  const initialBalance = users[0].balance_cents;

  const idempotencyKey = `integration-${randomUUID()}`;
  const orderResponses = await Promise.all([
    createRecharge(token, idempotencyKey, 100),
    createRecharge(token, idempotencyKey, 100),
  ]);
  assert(orderResponses.every((item) => item.status === 200), "并发订单请求未全部成功");
  assert(orderResponses[0].body.id === orderResponses[1].body.id, "同键返回了不同订单 ID");
  const orderId = orderResponses[0].body.id;
  const orderRows = await sql`select id, status from orders where id = ${orderId}`;
  const rechargeLedger = await sql`
    select count(*)::int as count
    from ledger
    where user_id = ${userId} and reason = 'recharge'
  `;
  const afterRecharge = await balanceOf(userId);
  assert(orderRows.length === 1 && orderRows[0].status === "paid", "订单没有唯一结算为 paid");
  assert(rechargeLedger[0].count === 1, "同键订单生成了重复充值流水");
  assert(afterRecharge === initialBalance + 100, "同键订单重复或未入账");

  await sql`
    insert into redeem_codes (code, amount_cents)
    values (${redeemCode}, 123)
  `;
  const redeemResponses = await Promise.all([
    redeem(token, redeemCode),
    redeem(token, redeemCode),
  ]);
  const redeemStatuses = redeemResponses.map((item) => item.status).sort((a, b) => a - b);
  assert(redeemStatuses[0] === 200 && redeemStatuses[1] === 400, "并发兑换没有得到一次成功一次拒绝");
  const redeemLedger = await sql`
    select count(*)::int as count
    from ledger
    where user_id = ${userId} and reason = 'redeem'
  `;
  const redeemOrders = await sql`
    select count(*)::int as count
    from orders
    where user_id = ${userId} and channel = 'redeem-code'
  `;
  const afterRedeem = await balanceOf(userId);
  assert(redeemLedger[0].count === 1, "并发兑换生成了重复流水");
  assert(redeemOrders[0].count === 1, "并发兑换生成了重复订单");
  assert(afterRedeem === afterRecharge + 123, "并发兑换重复或未入账");

  await sql`
    insert into redeem_codes (code, amount_cents)
    values (${rollbackCode}, 77)
  `;
  await sql.unsafe(`
    create function ${functionName}() returns trigger language plpgsql as $$
    begin
      raise exception 'billing integration forced ledger failure';
    end;
    $$
  `);
  await sql.unsafe(`
    create trigger ${triggerName}
    before insert on ledger
    for each row
    when (new.user_id = '${userId.replaceAll("'", "''")}')
    execute function ${functionName}()
  `);
  const rollbackResponse = await redeem(token, rollbackCode);
  assert(rollbackResponse.status === 500, "强制流水失败没有返回 500");
  const rollbackState = await sql`
    select used_by from redeem_codes where code = ${rollbackCode}
  `;
  assert(rollbackState[0]?.used_by === null, "事务失败后卡密仍被占用");
  assert(await balanceOf(userId) === afterRedeem, "事务失败后余额发生变化");

  console.log(JSON.stringify({
    orderReplay: { requests: 2, orders: 1, ledger: 1, creditedCents: 100 },
    redeemRace: { requests: 2, success: 1, rejected: 1, ledger: 1, creditedCents: 123 },
    rollback: { httpStatus: 500, codeReleased: true, balanceUnchanged: true },
  }));
} finally {
  await dropFailureTrigger().catch(() => {});
  if (userId) {
    await sql`delete from redeem_codes where code in (${redeemCode}, ${rollbackCode})`.catch(() => {});
    await sql`delete from users where id = ${userId}`.catch(() => {});
  }
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
  await sql.end({ timeout: 5 });
}

async function createRecharge(token, idempotencyKey, amountCents) {
  const response = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ kind: "recharge", amountCents }),
  });
  return { status: response.status, body: await response.json() };
}

async function redeem(token, code) {
  const response = await fetch(`${BASE_URL}/api/redeem`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function balanceOf(id) {
  const rows = await sql`select balance_cents from users where id = ${id}`;
  assert(rows.length === 1, "临时用户不存在");
  return rows[0].balance_cents;
}

async function dropFailureTrigger() {
  await sql.unsafe(`drop trigger if exists ${triggerName} on ledger`);
  await sql.unsafe(`drop function if exists ${functionName}()`);
}

async function waitForServer(child, output) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next dev 提前退出\n${output()}`);
    try {
      const response = await fetch(`${BASE_URL}/login`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待 Next dev 超时\n${output()}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

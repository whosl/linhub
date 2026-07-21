#!/usr/bin/env node

import crypto from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const workerSecret = process.env.SKILL_WORKER_SECRET;
const appUrl = (process.env.LINHUB_INTERNAL_URL || "http://127.0.0.1:3000").replace(/\/$/u, "");
if (!databaseUrl || !workerSecret) {
  throw new Error("Skill Worker 缺少 DATABASE_URL 或 SKILL_WORKER_SECRET");
}

const sql = postgres(databaseUrl, { max: 2, connect_timeout: 5 });
const workerId = `worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

while (!stopping) {
  try {
    await sql`
      update skill_runs
      set status = 'queued', lease_owner = null, lease_expires_at = null,
          stage = '等待恢复', updated_at = now()
      where status = 'running' and lease_expires_at < now()
    `;
    const [run] = await sql`
      with candidate as (
        select id from skill_runs
        where status = 'queued' and cancel_requested = false
        order by created_at
        for update skip locked
        limit 1
      )
      update skill_runs r
      set status = 'running', stage = 'Worker 已接收', lease_owner = ${workerId},
          lease_expires_at = now() + interval '6 minutes',
          started_at = coalesce(started_at, now()), updated_at = now()
      from candidate
      where r.id = candidate.id
      returning r.id
    `;
    if (!run) {
      await delay(750);
      continue;
    }
    const response = await fetch(
      `${appUrl}/api/internal/skill-runs/${encodeURIComponent(run.id)}/execute`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${workerSecret}` },
        signal: AbortSignal.timeout(330_000),
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
      await sql`
        update skill_runs set status = 'failed', stage = 'Worker 执行失败',
          error = ${message.slice(0, 2000)}, lease_expires_at = null,
          completed_at = now(), updated_at = now()
        where id = ${run.id} and status not in ('completed', 'cancelled')
      `;
      // execute route 在正常失败路径会自行生成回执；这里覆盖网络中断、进程退出等
      // route 未能收尾的情况。服务端用 runAttempt 做幂等，不会重复生成消息。
      await fetch(
        `${appUrl}/api/internal/skill-runs/${encodeURIComponent(run.id)}/receipt`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${workerSecret}` },
          signal: AbortSignal.timeout(30_000),
        }
      ).catch(() => undefined);
    }
  } catch (error) {
    console.error("skill_worker_error", error instanceof Error ? error.message : String(error));
    await delay(1500);
  }
}

await sql.end({ timeout: 5 });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

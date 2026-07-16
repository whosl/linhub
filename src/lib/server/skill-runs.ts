import "server-only";

import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import type {
  SkillRunAttachment,
  SkillRunEvent,
  SkillRunSnapshot,
  SkillRunStatus,
  SkillRunStepStatus,
} from "@/lib/types";

let tablesReady = false;

export async function ensureSkillRunTables() {
  if (tablesReady) return;
  await db.execute(sql`
    create table if not exists skill_runs (
      id text primary key,
      owner_id text not null references users(id) on delete cascade,
      conversation_id text not null references conversations(id) on delete cascade,
      message_id text references messages(id) on delete set null,
      skill_id text references skills(id) on delete set null,
      kind text not null,
      skill_name text not null,
      status text not null default 'queued',
      stage text not null default '等待执行',
      progress integer not null default 0,
      input jsonb not null default '{}'::jsonb,
      result jsonb,
      error text,
      cancel_requested boolean not null default false,
      lease_owner text,
      lease_expires_at timestamp,
      started_at timestamp,
      completed_at timestamp,
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    );
    create index if not exists skill_run_owner_idx on skill_runs(owner_id, created_at);
    create index if not exists skill_run_queue_idx on skill_runs(status, created_at);
    create index if not exists skill_run_conversation_idx on skill_runs(conversation_id, created_at);
    create table if not exists skill_run_steps (
      id text primary key,
      run_id text not null references skill_runs(id) on delete cascade,
      parent_step_id text,
      kind text not null,
      label text not null,
      status text not null default 'queued',
      progress integer not null default 0,
      source_count integer not null default 0,
      attempt integer not null default 0,
      model_id text,
      input jsonb,
      result jsonb,
      error text,
      started_at timestamp,
      completed_at timestamp,
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    );
    create index if not exists skill_run_step_run_idx on skill_run_steps(run_id, created_at);
    create table if not exists skill_run_events (
      sequence bigserial primary key,
      run_id text not null references skill_runs(id) on delete cascade,
      type text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamp not null default now()
    );
    create index if not exists skill_run_event_cursor_idx on skill_run_events(run_id, sequence);
  `);
  tablesReady = true;
}

export async function createSkillRun(input: {
  ownerId: string;
  conversationId: string;
  messageId?: string;
  skillId?: string;
  kind: string;
  skillName: string;
  payload: Record<string, unknown>;
}) {
  await ensureSkillRunTables();
  const id = `run-${uid()}`;
  await db.insert(schema.skillRuns).values({
    id,
    ownerId: input.ownerId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    skillId: input.skillId,
    kind: input.kind,
    skillName: input.skillName,
    input: input.payload,
  });
  await appendSkillRunEvent(id, "run-created", { skillName: input.skillName });
  return getSkillRunSnapshot(id, input.ownerId);
}

export async function appendSkillRunEvent(
  runId: string,
  type: string,
  payload: Record<string, unknown> = {}
) {
  await ensureSkillRunTables();
  const [event] = await db
    .insert(schema.skillRunEvents)
    .values({ runId, type, payload })
    .returning();
  return toEvent(event);
}

export async function upsertSkillRunStep(input: {
  id?: string;
  runId: string;
  parentStepId?: string;
  kind: "coordinator" | "subagent" | "tool" | "approval" | "artifact";
  label: string;
  status?: SkillRunStepStatus;
  progress?: number;
  sourceCount?: number;
  attempt?: number;
  modelId?: string;
  stepInput?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}) {
  await ensureSkillRunTables();
  const id = input.id ?? `step-${uid()}`;
  const status = input.status ?? "queued";
  const now = new Date();
  const values = {
    runId: input.runId,
    parentStepId: input.parentStepId,
    kind: input.kind,
    label: input.label,
    status,
    progress: clampProgress(input.progress ?? (status === "completed" ? 100 : 0)),
    sourceCount: Math.max(0, input.sourceCount ?? 0),
    attempt: Math.max(0, input.attempt ?? 0),
    modelId: input.modelId,
    input: input.stepInput,
    result: input.result,
    error: input.error,
    startedAt: status === "running" ? now : undefined,
    completedAt: isTerminalStep(status) ? now : undefined,
    updatedAt: now,
  };
  await db
    .insert(schema.skillRunSteps)
    .values({ id, ...values })
    .onConflictDoUpdate({ target: schema.skillRunSteps.id, set: values });
  await appendSkillRunEvent(input.runId, "step-updated", { stepId: id, status });
  return id;
}

export async function updateSkillRun(
  runId: string,
  patch: {
    status?: SkillRunStatus;
    stage?: string;
    progress?: number;
    result?: Record<string, unknown>;
    error?: string | null;
  }
) {
  await ensureSkillRunTables();
  const now = new Date();
  const status = patch.status;
  await db
    .update(schema.skillRuns)
    .set({
      ...(status ? { status } : {}),
      ...(patch.stage ? { stage: patch.stage } : {}),
      ...(typeof patch.progress === "number"
        ? { progress: clampProgress(patch.progress) }
        : {}),
      ...(patch.result ? { result: patch.result } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(status === "running" ? { startedAt: now } : {}),
      ...(status && isTerminalRun(status) ? { completedAt: now, leaseExpiresAt: null } : {}),
      updatedAt: now,
    })
    .where(eq(schema.skillRuns.id, runId));
  await appendSkillRunEvent(runId, "run-updated", {
    ...(status ? { status } : {}),
    ...(patch.stage ? { stage: patch.stage } : {}),
    ...(typeof patch.progress === "number" ? { progress: patch.progress } : {}),
  });
}

export async function requestSkillRunCancellation(runId: string, ownerId: string) {
  await ensureSkillRunTables();
  const [run] = await db
    .update(schema.skillRuns)
    .set({ cancelRequested: true, stage: "正在停止", updatedAt: new Date() })
    .where(and(eq(schema.skillRuns.id, runId), eq(schema.skillRuns.ownerId, ownerId)))
    .returning({ id: schema.skillRuns.id });
  if (!run) return false;
  await appendSkillRunEvent(runId, "cancel-requested");
  return true;
}

export async function resetSkillRun(runId: string, ownerId: string) {
  await ensureSkillRunTables();
  const [run] = await db
    .update(schema.skillRuns)
    .set({
      status: "queued",
      stage: "等待重试",
      progress: 0,
      error: null,
      result: null,
      cancelRequested: false,
      leaseOwner: null,
      leaseExpiresAt: null,
      startedAt: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.skillRuns.id, runId), eq(schema.skillRuns.ownerId, ownerId)))
    .returning({ id: schema.skillRuns.id });
  if (!run) return false;
  await appendSkillRunEvent(runId, "run-retried");
  return true;
}

export async function getSkillRunSnapshot(runId: string, ownerId?: string) {
  await ensureSkillRunTables();
  const conditions = [eq(schema.skillRuns.id, runId)];
  if (ownerId) conditions.push(eq(schema.skillRuns.ownerId, ownerId));
  const [run] = await db
    .select()
    .from(schema.skillRuns)
    .where(and(...conditions))
    .limit(1);
  if (!run) return null;
  const steps = await db
    .select()
    .from(schema.skillRunSteps)
    .where(eq(schema.skillRunSteps.runId, runId))
    .orderBy(asc(schema.skillRunSteps.createdAt));
  const result = run.result ?? {};
  const attachments = Array.isArray(result.attachments)
    ? (result.attachments as SkillRunAttachment[])
    : [];
  const sourceCount = steps.reduce((sum, step) => sum + step.sourceCount, 0);
  return {
    id: run.id,
    conversationId: run.conversationId,
    messageId: run.messageId ?? undefined,
    skillId: run.skillId ?? undefined,
    kind: run.kind,
    skillName: run.skillName,
    status: run.status,
    stageLabel: run.stage,
    progress: run.progress,
    steps: steps.map((step) => ({
      id: step.id,
      runId: step.runId,
      parentStepId: step.parentStepId ?? undefined,
      kind: step.kind,
      label: step.label,
      status: step.status,
      progress: step.progress,
      sourceCount: step.sourceCount,
      attempt: step.attempt,
      modelId: step.modelId ?? undefined,
      error: step.error ?? undefined,
      startedAt: step.startedAt?.toISOString(),
      completedAt: step.completedAt?.toISOString(),
    })),
    resultAttachments: attachments,
    sourceCount,
    error: run.error ?? undefined,
    startedAt: run.startedAt?.toISOString(),
    completedAt: run.completedAt?.toISOString(),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  } satisfies SkillRunSnapshot;
}

export async function getSkillRunRecord(runId: string) {
  await ensureSkillRunTables();
  const [run] = await db
    .select()
    .from(schema.skillRuns)
    .where(eq(schema.skillRuns.id, runId))
    .limit(1);
  return run ?? null;
}

export async function listSkillRunEvents(
  runId: string,
  ownerId: string,
  afterSequence: number,
  limit = 100
) {
  await ensureSkillRunTables();
  const [owned] = await db
    .select({ id: schema.skillRuns.id })
    .from(schema.skillRuns)
    .where(and(eq(schema.skillRuns.id, runId), eq(schema.skillRuns.ownerId, ownerId)))
    .limit(1);
  if (!owned) return null;
  const rows = await db
    .select()
    .from(schema.skillRunEvents)
    .where(
      and(
        eq(schema.skillRunEvents.runId, runId),
        gt(schema.skillRunEvents.sequence, Math.max(0, afterSequence))
      )
    )
    .orderBy(asc(schema.skillRunEvents.sequence))
    .limit(Math.min(Math.max(limit, 1), 500));
  return rows.map(toEvent);
}

export async function isSkillRunCancellationRequested(runId: string) {
  const [run] = await db
    .select({ requested: schema.skillRuns.cancelRequested })
    .from(schema.skillRuns)
    .where(eq(schema.skillRuns.id, runId))
    .limit(1);
  return run?.requested === true;
}

function toEvent(row: typeof schema.skillRunEvents.$inferSelect): SkillRunEvent {
  return {
    sequence: row.sequence,
    runId: row.runId,
    type: row.type,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}

function isTerminalRun(status: SkillRunStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isTerminalStep(status: SkillRunStepStatus) {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "skipped";
}

function clampProgress(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function uid() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

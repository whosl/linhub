import "server-only";

import { createHash } from "node:crypto";
import { generateText } from "ai";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { recordUsage } from "@/lib/server/billing";
import { db, schema } from "@/lib/server/db";
import { computeCostCents, resolveModel } from "@/lib/server/llm/registry";
import { appendSkillRunEvent, ensureSkillRunTables } from "@/lib/server/skill-runs";
import type { MessagePart } from "@/lib/types";

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;
const RECEIPT_STALE_MS = 5 * 60_000;

/**
 * 为任意终态 Skill Run 生成一次简短的助手回执。
 *
 * runAttempt + 确定性 message id 保证 worker/HTTP/SSE 多路恢复时不会重复落消息；
 * LLM 不可用时仍会落一条规则回执，让卡片不会完成后无下文。
 */
export async function ensureSkillRunCompletionReceipt(runId: string) {
  try {
    await generateSkillRunCompletionReceipt(runId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 1_000) : "完成回执生成失败";
    // 回执属于任务完成后的附加体验，任何故障都不能反向把已完成的主任务改成失败。
    try {
      await db
        .update(schema.skillRuns)
        .set({
          completionReceiptStatus: "failed",
          completionReceiptError: message,
          completionReceiptUpdatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.skillRuns.id, runId),
            eq(schema.skillRuns.completionReceiptStatus, "generating")
          )
        );
      await appendSkillRunEvent(runId, "completion-message-failed", {
        error: message,
      });
    } catch {
      // 数据库本身不可用时留给 worker/SSE 下一轮恢复，不覆盖主任务结果。
    }
  }
}

async function generateSkillRunCompletionReceipt(runId: string) {
  await ensureSkillRunTables();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - RECEIPT_STALE_MS);
  const [run] = await db
    .update(schema.skillRuns)
    .set({
      completionReceiptStatus: "generating",
      completionReceiptError: null,
      completionReceiptUpdatedAt: now,
    })
    .where(
      and(
        eq(schema.skillRuns.id, runId),
        inArray(schema.skillRuns.status, TERMINAL_STATUSES),
        or(
          eq(schema.skillRuns.completionReceiptStatus, "pending"),
          eq(schema.skillRuns.completionReceiptStatus, "failed"),
          and(
            eq(schema.skillRuns.completionReceiptStatus, "generating"),
            or(
              isNull(schema.skillRuns.completionReceiptUpdatedAt),
              lt(schema.skillRuns.completionReceiptUpdatedAt, staleBefore)
            )
          )
        )
      )
    )
    .returning();
  if (!run) return;

  const steps = await db
    .select({
      label: schema.skillRunSteps.label,
      status: schema.skillRunSteps.status,
      sourceCount: schema.skillRunSteps.sourceCount,
      result: schema.skillRunSteps.result,
      error: schema.skillRunSteps.error,
    })
    .from(schema.skillRunSteps)
    .where(eq(schema.skillRunSteps.runId, run.id))
    .orderBy(asc(schema.skillRunSteps.createdAt));
  const [conversation] = await db
    .select({ modelId: schema.conversations.modelId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, run.conversationId))
    .limit(1);

  const requestedModelId = stringValue(run.input.modelId) || conversation?.modelId || "";
  let modelId = requestedModelId || undefined;
  let text = fallbackReceipt(run);
  let usage: { inputTokens: number; outputTokens: number; costCents: number } | undefined;
  let billingRecord: typeof schema.models.$inferSelect | undefined;
  let generationError: string | undefined;

  if (requestedModelId) {
    try {
      const resolved = await resolveModel(requestedModelId);
      modelId = resolved.record.id;
      billingRecord = resolved.record;
      const generated = await generateText({
        model: resolved.model,
        system: [
          "你负责向用户简短汇报一个后台任务卡片的最终状态。",
          "使用 2–5 句话，先说最重要的结论或交付物，再给一个自然的下一步提示。",
          "成功时可以概括结果并说明附件可在任务卡中打开；失败或取消时必须准确说明状态，不得声称已完成。",
          "不要复述完整报告，不要展示思维过程，不要编造输入中没有的数字、来源或结论。",
          "直接输出给用户的正文，不要写标题或状态标签。",
        ].join("\n"),
        prompt: JSON.stringify(
          {
            skill: run.skillName,
            kind: run.kind,
            status: run.status,
            stage: run.stage,
            request: compactRequest(run.input),
            result: compactResult(run.result),
            error: run.error?.slice(0, 1_000),
            steps: steps.slice(-12).map((step) => ({
              label: step.label,
              status: step.status,
              sourceCount: step.sourceCount,
              result: compactUnknown(step.result, 600),
              error: step.error?.slice(0, 300),
            })),
          },
          null,
          2
        ).slice(0, 16_000),
        abortSignal: AbortSignal.timeout(20_000),
        maxOutputTokens: 500,
      });
      if (generated.text.trim()) text = generated.text.trim();
      const inputTokens = generated.usage.inputTokens ?? 0;
      const outputTokens = generated.usage.outputTokens ?? 0;
      usage = {
        inputTokens,
        outputTokens,
        costCents: computeCostCents(resolved.record, { inputTokens, outputTokens }),
      };
    } catch (error) {
      generationError = error instanceof Error ? error.message.slice(0, 1_000) : "回执模型不可用";
    }
  }

  const messageId = completionMessageId(run.id, run.runAttempt);
  const parentId = await resolveReceiptParent(run.conversationId, run.messageId);
  const parts: MessagePart[] = [
    { type: "text", text },
    { type: "skill-run-receipt", runId: run.id, runAttempt: run.runAttempt },
  ];

  try {
    const persisted = await db.transaction(async (tx) => {
      // 先用条件更新锁定本次 attempt；若用户已经点了重试，旧执行不得再写回执。
      const [activeAttempt] = await tx
        .update(schema.skillRuns)
        .set({ completionReceiptUpdatedAt: new Date() })
        .where(
          and(
            eq(schema.skillRuns.id, run.id),
            eq(schema.skillRuns.runAttempt, run.runAttempt),
            eq(schema.skillRuns.completionReceiptStatus, "generating")
          )
        )
        .returning({ id: schema.skillRuns.id });
      if (!activeAttempt) return false;

      await tx
        .insert(schema.messages)
        .values({
          id: messageId,
          conversationId: run.conversationId,
          parentId,
          role: "assistant",
          modelId,
          parts,
          status: "complete",
          usage,
        })
        .onConflictDoNothing({ target: schema.messages.id });
      await tx
        .update(schema.skillRuns)
        .set({
          completionReceiptStatus: "completed",
          completionMessageId: messageId,
          completionReceiptError: generationError ?? null,
          completionReceiptUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.skillRuns.id, run.id),
            eq(schema.skillRuns.runAttempt, run.runAttempt)
          )
        );
      return true;
    });
    if (persisted) {
      await appendSkillRunEvent(run.id, "completion-message-created", {
        messageId,
        runAttempt: run.runAttempt,
      });
      if (usage && billingRecord) {
        await recordUsage(run.ownerId, billingRecord, run.conversationId, usage, {
          allowDebt: true,
          capability: "subagent",
        }).catch(() => undefined);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "完成回执落库失败";
    await db
      .update(schema.skillRuns)
      .set({
        completionReceiptStatus: "failed",
        completionReceiptError: message,
        completionReceiptUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.skillRuns.id, run.id),
          eq(schema.skillRuns.runAttempt, run.runAttempt),
          eq(schema.skillRuns.completionReceiptStatus, "generating")
        )
      );
    await appendSkillRunEvent(run.id, "completion-message-failed", { error: message });
  }
}

async function resolveReceiptParent(conversationId: string, requestedParentId: string | null) {
  if (requestedParentId) {
    const [message] = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.id, requestedParentId),
          eq(schema.messages.conversationId, conversationId)
        )
      )
      .limit(1);
    if (message) return message.id;
  }
  const [conversation] = await db
    .select({ currentLeafId: schema.conversations.currentLeafId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  return conversation?.currentLeafId ?? null;
}

function fallbackReceipt(run: typeof schema.skillRuns.$inferSelect) {
  if (run.status === "cancelled") {
    return `“${run.skillName}”已停止，没有继续生成后续结果。你可以在任务卡中重新开始。`;
  }
  if (run.status === "failed") {
    return `“${run.skillName}”本次没有完成：${run.error?.trim().slice(0, 300) || "执行过程中出现错误"}。你可以在任务卡中重试。`;
  }
  const attachments = attachmentNames(run.result);
  return attachments.length > 0
    ? `“${run.skillName}”已完成，并生成了 ${attachments.join("、")}。你可以直接在任务卡中打开或下载。`
    : `“${run.skillName}”已完成。结果已经更新到任务卡中，你可以继续查看或基于结果提出下一步要求。`;
}

function compactRequest(input: Record<string, unknown>) {
  const keys = ["query", "question", "topic", "audience", "pageCount", "mode", "tasks"];
  return Object.fromEntries(
    keys.flatMap((key) => (input[key] === undefined ? [] : [[key, compactUnknown(input[key], 2_000)] as const]))
  );
}

function compactResult(result: Record<string, unknown> | null) {
  if (!result) return null;
  const keys = ["reportPreview", "summary", "sourceCount", "slideCount", "results", "attachments"];
  return Object.fromEntries(
    keys.flatMap((key) => (result[key] === undefined ? [] : [[key, compactUnknown(result[key], 5_000)] as const]))
  );
}

function compactUnknown(value: unknown, maxChars: number): unknown {
  if (typeof value === "string") return value.slice(0, maxChars);
  try {
    const json = JSON.stringify(value);
    return json.length <= maxChars ? value : `${json.slice(0, maxChars)}…`;
  } catch {
    return String(value).slice(0, maxChars);
  }
}

function attachmentNames(result: Record<string, unknown> | null) {
  if (!result || !Array.isArray(result.attachments)) return [];
  return result.attachments.slice(0, 5).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const name = (value as Record<string, unknown>).name;
    return typeof name === "string" && name.trim() ? [name.trim()] : [];
  });
}

function completionMessageId(runId: string, attempt: number) {
  const digest = createHash("sha256").update(`${runId}:${attempt}:completion`).digest("hex").slice(0, 16);
  return `msg-${digest}`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

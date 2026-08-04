import crypto from "node:crypto";
import { after } from "next/server";
import { assertCanSpend, recordUsage } from "@/lib/server/billing";
import { schema } from "@/lib/server/db";
import { computeCostCents, resolveModel } from "@/lib/server/llm/registry";
import { ensureSkillRunCompletionReceipt } from "@/lib/server/skill-run-completion-receipt";
import {
  getSkillRunRecord,
  isSkillRunCancellationRequested,
  settleRunningSkillRunSteps,
  updateSkillRun,
  upsertSkillRunStep,
} from "@/lib/server/skill-runs";
import { runParallelSubagents, type SubagentTask } from "@/lib/server/subagents";

export const maxDuration = 360;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validWorkerSecret(request.headers.get("authorization"))) {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const { id } = await params;
  const run = await getSkillRunRecord(id);
  if (!run) return Response.json({ error: "任务不存在" }, { status: 404 });
  if (run.cancelRequested) {
    await updateSkillRun(id, { status: "cancelled", stage: "已停止", progress: 100 });
    scheduleCompletionReceipt(id);
    return Response.json({ ok: true, status: "cancelled" });
  }
  try {
    if (run.kind === "deep-research") {
      const { executeDeepResearchRun } = await import(
        "@/lib/server/research/deep-research"
      );
      await executeDeepResearchRun(run);
    } else if (run.kind === "data-analysis") {
      const { executeDataAnalysisRun } = await import(
        "@/lib/server/data-analysis/data-analysis"
      );
      await executeDataAnalysisRun(run);
    } else if (run.kind === "ppt-studio") {
      const { executePptStudioRun } = await import(
        "@/lib/server/ppt-studio/ppt-studio"
      );
      await executePptStudioRun(run);
    } else if (run.kind === "subagent-batch") {
      await executeSubagentBatch(run);
    } else if (run.kind === "code-lab") {
      const { executeCodeLabRun } = await import(
        "@/lib/server/code-lab/code-lab"
      );
      await executeCodeLabRun(run);
    } else {
      throw new Error(`尚未注册 Skill 执行器：${run.kind}`);
    }
    scheduleCompletionReceipt(id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : "Skill 执行失败";
    const cancelled =
      (error instanceof Error && error.name === "AbortError") ||
      (await isSkillRunCancellationRequested(id));
    if (cancelled) {
      await settleRunningSkillRunSteps(id, "cancelled");
      await updateSkillRun(id, {
        status: "cancelled",
        stage: "已停止",
        progress: 100,
        error: null,
      });
      scheduleCompletionReceipt(id);
      return Response.json({ ok: true, status: "cancelled" });
    }
    await settleRunningSkillRunSteps(id, "failed", message);
    await updateSkillRun(id, { status: "failed", stage: "执行失败", error: message });
    scheduleCompletionReceipt(id);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function executeSubagentBatch(run: typeof schema.skillRuns.$inferSelect) {
  const modelId = typeof run.input.modelId === "string" ? run.input.modelId : "";
  const rawTasks = Array.isArray(run.input.tasks) ? run.input.tasks : [];
  const tasks: SubagentTask[] = rawTasks.slice(0, 6).flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const instruction = typeof item.instruction === "string" ? item.instruction.trim() : "";
    return title && instruction
      ? [{ id: `task-${index + 1}`, title, instruction }]
      : [];
  });
  if (!modelId || tasks.length === 0) throw new Error("Subagent 任务参数不完整");
  await assertCanSpend(run.ownerId);
  const resolved = await resolveModel(modelId);
  await updateSkillRun(run.id, { status: "running", stage: "并行执行子任务", progress: 10 });
  const controller = new AbortController();
  const cancellationTimer = setInterval(() => {
    void isSkillRunCancellationRequested(run.id).then((requested) => {
      if (requested) controller.abort();
    });
  }, 750);
  try {
    const results = await runParallelSubagents({
      model: resolved.model,
      tasks,
      system:
        typeof run.input.system === "string" ? run.input.system : "完成指定子任务。",
      signal: controller.signal,
      onTaskStarted: async (task) => {
        await upsertSkillRunStep({
          id: `${run.id}-${task.id}`,
          runId: run.id,
          kind: "subagent",
          label: task.title,
          status: "running",
          modelId,
        });
      },
      onTaskFinished: async (result) => {
        await upsertSkillRunStep({
          id: `${run.id}-${result.taskId}`,
          runId: run.id,
          kind: "subagent",
          label: result.title,
          status:
            result.status === "completed"
              ? "completed"
              : result.status === "cancelled"
                ? "cancelled"
                : "failed",
          progress: 100,
          sourceCount: result.sourceCount,
          modelId,
          result: { summary: result.summary },
          error: result.error,
        });
      },
    });
    if (controller.signal.aborted) {
      await updateSkillRun(run.id, { status: "cancelled", stage: "已停止", progress: 100 });
      return;
    }
    const usage = results.reduce(
      (total, result) => ({
        inputTokens: total.inputTokens + result.usage.inputTokens,
        outputTokens: total.outputTokens + result.usage.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 }
    );
    await recordUsage(
      run.ownerId,
      resolved.record,
      run.conversationId,
      { ...usage, costCents: computeCostCents(resolved.record, usage) },
      { allowDebt: true, capability: "subagent" }
    );
    await updateSkillRun(run.id, {
      status: "completed",
      stage: "已完成",
      progress: 100,
      result: { results },
      error: null,
    });
  } finally {
    clearInterval(cancellationTimer);
  }
}

function validWorkerSecret(authorization: string | null) {
  const expected = process.env.SKILL_WORKER_SECRET;
  const provided = authorization?.replace(/^Bearer\s+/iu, "") ?? "";
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function scheduleCompletionReceipt(runId: string) {
  after(() => ensureSkillRunCompletionReceipt(runId));
}

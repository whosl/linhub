import "server-only";

import { generateObject, generateText } from "ai";
import { z } from "zod";
import { assertCanSpend, recordUsage } from "@/lib/server/billing";
import { schema } from "@/lib/server/db";
import { persistGeneratedAttachment } from "@/lib/server/generated-attachment";
import { computeCostCents, resolveModel } from "@/lib/server/llm/registry";
import {
  isSkillRunCancellationRequested,
  updateSkillRun,
  upsertSkillRunStep,
} from "@/lib/server/skill-runs";
import { runParallelSubagents } from "@/lib/server/subagents";
import {
  buildResearchToolBundle,
  researchProviderInstructions,
  type ResearchLocale,
} from "@/lib/server/research/provider-policy";

const ResearchPlanSchema = z.object({
  locale: z.enum(["zh", "foreign", "mixed"]).default("mixed"),
  tasks: z
    .array(
      z.object({
        title: z.string().min(2).max(80),
        instruction: z.string().min(10).max(800),
        locale: z.enum(["zh", "foreign", "mixed"]).default("mixed"),
      })
    )
    .min(2)
    .max(6),
});

export async function executeDeepResearchRun(run: typeof schema.skillRuns.$inferSelect) {
  const query = stringValue(run.input.query);
  const modelId = stringValue(run.input.modelId);
  const mode = run.input.mode === "quick" ? "quick" : "deep";
  if (!query || !modelId) throw new Error("深度调研缺少问题或模型");
  await assertCanSpend(run.ownerId);
  const resolved = await resolveModel(modelId);
  const controller = new AbortController();
  const cancellationTimer = setInterval(() => {
    void isSkillRunCancellationRequested(run.id).then((requested) => {
      if (requested) controller.abort();
    });
  }, 750);
  const usage = { inputTokens: 0, outputTokens: 0 };
  try {
    await updateSkillRun(run.id, {
      status: "running",
      stage: "制定调研计划",
      progress: 5,
    });
    const plannerStep = await upsertSkillRunStep({
      id: `${run.id}-plan`,
      runId: run.id,
      kind: "coordinator",
      label: "制定调研计划",
      status: "running",
      modelId,
    });
    const planned = await generateObject({
      model: resolved.model,
      schema: ResearchPlanSchema,
      prompt: [
        "把用户问题拆成互不重复、可并行、可用公开来源验证的研究子任务。",
        `模式：${mode === "quick" ? "快速调研，生成 2 个任务" : "深度调研，生成 3–6 个任务"}。`,
        "locale=zh 表示中文/中国来源优先；foreign 表示外文/国际来源优先；mixed 表示混合。",
        `用户问题：${query}`,
      ].join("\n"),
      abortSignal: controller.signal,
      maxOutputTokens: 1_200,
    });
    usage.inputTokens += planned.usage.inputTokens ?? 0;
    usage.outputTokens += planned.usage.outputTokens ?? 0;
    const tasks = planned.object.tasks.slice(0, mode === "quick" ? 2 : 6);
    await upsertSkillRunStep({
      id: plannerStep,
      runId: run.id,
      kind: "coordinator",
      label: "制定调研计划",
      status: "completed",
      progress: 100,
      modelId,
      result: { taskCount: tasks.length },
    });
    await updateSkillRun(run.id, {
      stage: `并行调研（${tasks.length} 个子任务）`,
      progress: 15,
    });

    const bundle = await buildResearchToolBundle(run.ownerId);
    let completed = 0;
    let results;
    try {
      results = await runParallelSubagents({
        model: resolved.model,
        tasks: tasks.map((task, index) => ({
          id: `research-${index + 1}`,
          title: task.title,
          instruction: `${task.instruction}\n\n${researchProviderInstructions(task.locale)}`,
        })),
        system: [
          "执行深度调研子任务。每个关键事实附可访问 URL，注明发布日期和来源级别。",
          "不要输出思维过程；只返回结论、证据、来源和不确定性。",
          researchProviderInstructions(planned.object.locale as ResearchLocale),
        ].join("\n\n"),
        buildTools: () => bundle.tools,
        maxConcurrency: mode === "quick" ? 2 : 4,
        maxSteps: mode === "quick" ? 6 : 10,
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
          completed += 1;
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
          await updateSkillRun(run.id, {
            stage: `并行调研（${completed}/${tasks.length}）`,
            progress: 15 + Math.round((completed / tasks.length) * 55),
          });
        },
      });
    } finally {
      await bundle.close();
    }
    if (controller.signal.aborted) {
      await updateSkillRun(run.id, { status: "cancelled", stage: "已停止", progress: 100 });
      return;
    }
    for (const result of results) {
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
    }
    const successful = results.filter((result) => result.status === "completed" && result.summary);
    if (successful.length === 0) throw new Error("所有调研子任务均失败，请稍后重试");

    await updateSkillRun(run.id, { stage: "交叉核验并生成报告", progress: 78 });
    const synthesisStep = await upsertSkillRunStep({
      id: `${run.id}-synthesis`,
      runId: run.id,
      kind: "coordinator",
      label: "交叉核验并生成报告",
      status: "running",
      modelId,
    });
    const synthesis = await generateText({
      model: resolved.model,
      system: [
        "你是研究报告主编。基于子任务结果去重、交叉核验并生成中文 Markdown 报告。",
        "先给结论摘要，再给分节分析；关键事实保留原始 URL 行内引用。",
        "明确区分事实、推断和建议，指出冲突、证据不足、数据截止日期与研究限制。",
        "不要声称访问了子任务未提供的来源，不要输出思维过程。",
      ].join("\n"),
      prompt: `研究问题：${query}\n\n子任务结果：\n${successful
        .map((item, index) => `## ${index + 1}. ${item.title}\n${item.summary}`)
        .join("\n\n")}`,
      abortSignal: controller.signal,
      maxOutputTokens: 8_000,
    });
    usage.inputTokens += synthesis.usage.inputTokens ?? 0;
    usage.outputTokens += synthesis.usage.outputTokens ?? 0;
    const report = synthesis.text.trim();
    const attachment = await persistGeneratedAttachment({
      ownerId: run.ownerId,
      name: `${safeTitle(query)}-深度调研报告.md`,
      mimeType: "text/markdown",
      bytes: Buffer.from(report, "utf-8"),
      extractedText: report,
    });
    await upsertSkillRunStep({
      id: synthesisStep,
      runId: run.id,
      kind: "coordinator",
      label: "交叉核验并生成报告",
      status: "completed",
      progress: 100,
      sourceCount: countUrls(report),
      modelId,
      result: { attachmentId: attachment.id },
    });
    await recordUsage(
      run.ownerId,
      resolved.record,
      run.conversationId,
      { ...usage, costCents: computeCostCents(resolved.record, usage) },
      { allowDebt: true, capability: "subagent" }
    );
    await updateSkillRun(run.id, {
      status: "completed",
      stage: "调研报告已完成",
      progress: 100,
      result: {
        attachments: [attachment],
        reportPreview: report.slice(0, 2_000),
        sourceCount: countUrls(report),
      },
      error: null,
    });
  } finally {
    clearInterval(cancellationTimer);
  }
}

function countUrls(text: string) {
  return new Set(text.match(/https?:\/\/[^\s)\]}>"']+/gu) ?? []).size;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeTitle(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "research";
}

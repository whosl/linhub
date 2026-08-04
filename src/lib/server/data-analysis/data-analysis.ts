import "server-only";

import { generateText } from "ai";
import { and, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertCanSpend, recordUsage } from "@/lib/server/billing";
import { db, schema } from "@/lib/server/db";
import { extractSpreadsheetData } from "@/lib/server/document-extract";
import { persistGeneratedAttachment } from "@/lib/server/generated-attachment";
import { computeCostCents, resolveModel } from "@/lib/server/llm/registry";
import { openMediaStream } from "@/lib/server/media";
import { localAttachmentPath } from "@/lib/server/pptx";
import {
  buildResearchToolBundle,
  researchProviderInstructions,
} from "@/lib/server/research/provider-policy";
import { runCodeSandbox } from "@/lib/server/code-sandbox";
import {
  codeSandboxLimits,
  codeSandboxPolicySummary,
  resolveCodeSandboxPolicy,
} from "@/lib/server/code-sandbox-policy";
import {
  isSkillRunCancellationRequested,
  updateSkillRun,
  upsertSkillRunStep,
} from "@/lib/server/skill-runs";
import { runParallelSubagents } from "@/lib/server/subagents";

const SKILL_ROOT = path.join(process.cwd(), "data", "skills", "builtin", "data-analyst");

export async function executeDataAnalysisRun(run: typeof schema.skillRuns.$inferSelect) {
  const question = stringValue(run.input.question);
  const modelId = stringValue(run.input.modelId);
  const attachmentIds = Array.isArray(run.input.attachmentIds)
    ? run.input.attachmentIds.filter((value): value is string => typeof value === "string").slice(0, 8)
    : [];
  const needsExternalData = run.input.needsExternalData === true;
  if (!question || !modelId || attachmentIds.length === 0) {
    throw new Error("数据分析缺少问题、模型或数据附件");
  }
  await assertCanSpend(run.ownerId);
  const resolved = await resolveModel(modelId);
  const sandboxPolicy = await resolveCodeSandboxPolicy(run.ownerId);
  const controller = new AbortController();
  const cancellationTimer = setInterval(() => {
    void isSkillRunCancellationRequested(run.id).then((requested) => {
      if (requested) controller.abort();
    });
  }, 750);
  const usage = { inputTokens: 0, outputTokens: 0 };

  try {
    await updateSkillRun(run.id, { status: "running", stage: "读取并检查数据", progress: 5 });
    const inspectStep = await upsertSkillRunStep({
      id: `${run.id}-inspect`,
      runId: run.id,
      kind: "tool",
      label: "读取并检查数据",
      status: "running",
    });
    const sources = [];
    for (const attachmentId of attachmentIds) {
      const file = await loadOwnedDataAttachment(run.ownerId, attachmentId);
      const sheets = await extractSpreadsheetData(file.name, file.buffer);
      sources.push({ attachmentId, name: file.name, sheets });
    }
    await upsertSkillRunStep({
      id: inspectStep,
      runId: run.id,
      kind: "tool",
      label: "读取并检查数据",
      status: "completed",
      progress: 100,
      result: {
        fileCount: sources.length,
        sheetCount: sources.reduce((sum, item) => sum + item.sheets.length, 0),
      },
    });

    if (controller.signal.aborted) return markCancelled(run.id);
    await updateSkillRun(run.id, { stage: "在隔离沙盒中分析", progress: 25 });
    const sandboxStep = await upsertSkillRunStep({
      id: `${run.id}-sandbox`,
      runId: run.id,
      kind: "tool",
      label: "在隔离沙盒中分析",
      status: "running",
    });
    const [profileCode, template] = await Promise.all([
      readFile(path.join(SKILL_ROOT, "scripts", "profile_data.py"), "utf8"),
      readFile(path.join(SKILL_ROOT, "assets", "report-template.html"), "utf8"),
    ]);
    const sandbox = await runCodeSandbox({
      language: "python",
      code: profileCode,
      signal: controller.signal,
      inputFiles: [
        {
          path: "dataset.json",
          content: JSON.stringify({ question, sources }),
        },
        { path: "report-template.html", content: template },
      ],
      limits: {
        ...codeSandboxLimits(sandboxPolicy, 120),
        outputFiles: Math.min(sandboxPolicy.limits.outputFiles, 100),
      },
    });
    if (sandbox.timedOut) throw new Error("数据分析沙盒运行超时");
    if (sandbox.stdoutStderrLimitExceeded || sandbox.outputLimitExceeded) {
      throw new Error("数据分析输出超过安全限制，未发布不完整结果");
    }
    if (sandbox.exitCode !== 0) {
      throw new Error(`数据分析脚本失败：${sandbox.stderr.trim().slice(0, 1_500) || "未知错误"}`);
    }
    const profileFile = sandbox.outputFiles.find((file) => file.path === "profile.json");
    if (!profileFile) throw new Error("数据分析脚本未生成 profile.json");
    const outputNames = new Set(sandbox.outputFiles.map((file) => file.path));
    for (const required of [
      "profile.json",
      "quality-report.md",
      "chart.svg",
      "cleaned-data.csv",
      "analysis-preview.html",
    ]) {
      if (!outputNames.has(required)) throw new Error(`数据分析缺少输出：${required}`);
    }
    const profile = JSON.parse(profileFile.data.toString("utf8")) as Record<string, unknown>;
    await upsertSkillRunStep({
      id: sandboxStep,
      runId: run.id,
      kind: "tool",
      label: "在隔离沙盒中分析",
      status: "completed",
      progress: 100,
      result: { outputCount: sandbox.outputFiles.length },
    });

    let externalContext = "";
    let sourceCount = 0;
    if (needsExternalData) {
      if (controller.signal.aborted) return markCancelled(run.id);
      await updateSkillRun(run.id, { stage: "补充外部数据与行业口径", progress: 52 });
      const bundle = await buildResearchToolBundle(run.ownerId);
      try {
        const research = await runParallelSubagents({
          model: resolved.model,
          tasks: [
            {
              id: "external-data",
              title: "查找外部数据与官方口径",
              instruction: `${question}\n查找可用于补充或核验本地数据的权威公开数据、统计口径和原始来源。\n${researchProviderInstructions("mixed")}`,
            },
            {
              id: "benchmark",
              title: "查找行业基准与背景",
              instruction: `${question}\n查找与指标解释相关的行业基准、历史趋势和限制，保留 URL 与发布日期。\n${researchProviderInstructions("mixed")}`,
            },
          ],
          system: "只返回可验证的外部数据、口径、来源 URL 和限制，不输出思维过程。",
          buildTools: () => bundle.tools,
          maxConcurrency: 2,
          maxSteps: 8,
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
              status: result.status === "completed" ? "completed" : result.status === "cancelled" ? "cancelled" : "failed",
              progress: 100,
              sourceCount: result.sourceCount,
              modelId,
              result: { summary: result.summary },
              error: result.error,
            });
          },
        });
        externalContext = research
          .filter((item) => item.status === "completed")
          .map((item) => `## ${item.title}\n${item.summary}`)
          .join("\n\n");
        sourceCount = research.reduce((sum, item) => sum + item.sourceCount, 0);
        for (const result of research) {
          usage.inputTokens += result.usage.inputTokens;
          usage.outputTokens += result.usage.outputTokens;
        }
      } finally {
        await bundle.close();
      }
    }

    if (controller.signal.aborted) return markCancelled(run.id);
    await updateSkillRun(run.id, { stage: "生成分析结论与交付物", progress: 76 });
    const reportStep = await upsertSkillRunStep({
      id: `${run.id}-report`,
      runId: run.id,
      kind: "artifact",
      label: "生成分析结论与交付物",
      status: "running",
      modelId,
    });
    const synthesis = await generateText({
      model: resolved.model,
      system: [
        "你是严谨的数据分析师。根据确定性分析产出的 profile 生成中文 Markdown 报告。",
        "先给结论摘要，再写数据质量、关键发现、解释、限制和下一步建议。",
        "不得从样本统计推断不存在的因果关系；截断数据必须明确标注。",
        "如提供外部研究，只把带 URL 的内容作为外部背景并与本地数据结论分开。",
        "不要输出思维过程。",
      ].join("\n"),
      prompt: `用户问题：${question}\n\n确定性分析 profile：\n${JSON.stringify(profile).slice(0, 80_000)}\n\n外部研究：\n${externalContext || "未请求外部数据；禁止自行补充网页事实。"}`,
      abortSignal: controller.signal,
      maxOutputTokens: 6_000,
    });
    usage.inputTokens += synthesis.usage.inputTokens ?? 0;
    usage.outputTokens += synthesis.usage.outputTokens ?? 0;
    const report = synthesis.text.trim();
    const persisted = [];
    for (const output of sandbox.outputFiles) {
      const attachment = await persistGeneratedAttachment({
        ownerId: run.ownerId,
        name: output.path,
        mimeType: outputMimeType(output.path),
        bytes: output.data,
        extractedText: isTextOutput(output.path) ? output.data.toString("utf8") : undefined,
      });
      persisted.push(attachment);
    }
    const reportAttachment = await persistGeneratedAttachment({
      ownerId: run.ownerId,
      name: `${safeTitle(question)}-数据分析报告.md`,
      mimeType: "text/markdown",
      bytes: Buffer.from(report, "utf8"),
      extractedText: report,
    });
    const codeAttachment = await persistGeneratedAttachment({
      ownerId: run.ownerId,
      name: "profile_data.py",
      mimeType: "text/x-python",
      bytes: Buffer.from(profileCode, "utf8"),
      extractedText: profileCode,
    });
    persisted.push(reportAttachment, codeAttachment);
    await upsertSkillRunStep({
      id: reportStep,
      runId: run.id,
      kind: "artifact",
      label: "生成分析结论与交付物",
      status: "completed",
      progress: 100,
      sourceCount,
      modelId,
      result: { attachmentCount: persisted.length },
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
      stage: "数据分析已完成",
      progress: 100,
      result: {
        attachments: persisted,
        sourceCount,
        reportPreview: report.slice(0, 2_000),
        sandboxPolicy: codeSandboxPolicySummary(sandboxPolicy),
      },
      error: null,
    });
  } finally {
    clearInterval(cancellationTimer);
  }
}

async function loadOwnedDataAttachment(userId: string, attachmentId: string) {
  const media = await openMediaStream(attachmentId, userId);
  if (media) return { name: media.row.name, buffer: media.buffer };
  const [attachment] = await db
    .select({ name: schema.attachments.name, storagePath: schema.attachments.storagePath })
    .from(schema.attachments)
    .where(and(eq(schema.attachments.id, attachmentId), eq(schema.attachments.ownerId, userId)))
    .limit(1);
  if (!attachment) throw new Error("数据附件不存在或无权访问");
  if (attachment.storagePath.startsWith("/api/media/")) {
    const mediaId = attachment.storagePath.replace(/^\/api\/media\//u, "");
    const stored = await openMediaStream(mediaId, userId);
    if (stored) return { name: attachment.name, buffer: stored.buffer };
  }
  const filePath = localAttachmentPath(attachment.storagePath);
  if (!filePath) throw new Error("数据附件文件不可读取");
  return { name: attachment.name, buffer: await readFile(filePath) };
}

async function markCancelled(runId: string) {
  await updateSkillRun(runId, { status: "cancelled", stage: "已停止", progress: 100 });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeTitle(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "analysis";
}

function isTextOutput(name: string) {
  return /\.(?:csv|html|json|md|py|svg|txt)$/iu.test(name);
}

function outputMimeType(name: string) {
  const ext = path.extname(name).toLowerCase();
  return ({
    ".csv": "text/csv",
    ".html": "text/html",
    ".json": "application/json",
    ".md": "text/markdown",
    ".svg": "image/svg+xml",
  } as Record<string, string>)[ext] ?? "application/octet-stream";
}

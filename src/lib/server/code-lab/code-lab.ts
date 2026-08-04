import "server-only";

import { schema } from "@/lib/server/db";
import {
  runCodeSandbox,
  type SandboxInputFile,
  type SandboxLanguage,
} from "@/lib/server/code-sandbox";
import {
  codeSandboxInputName,
  loadOwnedCodeSandboxInput,
  persistCodeSandboxOutputs,
} from "@/lib/server/code-sandbox-files";
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

export async function executeCodeLabRun(
  run: typeof schema.skillRuns.$inferSelect
) {
  const language = sandboxLanguage(run.input.language);
  const code = stringValue(run.input.code);
  const args = stringArray(run.input.args, 32);
  const inputs = sandboxInputs(run.input.inputs);
  if (!language || !code) throw new Error("Code Lab 缺少运行语言或代码");

  const policy = await resolveCodeSandboxPolicy(run.ownerId);
  const requestedTimeout = numberValue(run.input.timeoutSeconds) ?? 300;
  const timeoutSeconds = Math.min(
    Math.max(Math.round(requestedTimeout), 1),
    policy.maxBackgroundTimeoutSeconds
  );
  const controller = new AbortController();
  const cancellationTimer = setInterval(() => {
    void isSkillRunCancellationRequested(run.id).then((requested) => {
      if (requested) controller.abort();
    });
  }, 750);

  try {
    await updateSkillRun(run.id, {
      status: "running",
      stage: "准备隔离环境和输入文件",
      progress: 5,
    });
    const prepareStep = await upsertSkillRunStep({
      id: `${run.id}-prepare`,
      runId: run.id,
      kind: "tool",
      label: "准备隔离环境和输入文件",
      status: "running",
    });
    const inputFiles: SandboxInputFile[] = [];
    const usedPaths = new Set<string>();
    for (const input of inputs) {
      if (controller.signal.aborted) throw abortError();
      const loaded = await loadOwnedCodeSandboxInput(
        run.ownerId,
        input.attachmentId
      );
      let targetPath = input.path || codeSandboxInputName(loaded.name);
      if (usedPaths.has(targetPath)) targetPath = `${input.attachmentId}-${targetPath}`;
      usedPaths.add(targetPath);
      inputFiles.push({ path: targetPath, content: loaded.buffer });
    }
    const policySummary = codeSandboxPolicySummary(policy);
    await upsertSkillRunStep({
      id: prepareStep,
      runId: run.id,
      kind: "tool",
      label: "准备隔离环境和输入文件",
      status: "completed",
      progress: 100,
      result: { inputCount: inputFiles.length, sandboxPolicy: policySummary },
    });

    await updateSkillRun(run.id, {
      stage: `在 gVisor 中运行（最长 ${timeoutSeconds} 秒）`,
      progress: 20,
    });
    const executeStep = await upsertSkillRunStep({
      id: `${run.id}-execute`,
      runId: run.id,
      kind: "tool",
      label: `运行 ${language} 代码`,
      status: "running",
    });
    const result = await runCodeSandbox({
      language,
      code,
      args,
      inputFiles,
      signal: controller.signal,
      limits: codeSandboxLimits(policy, timeoutSeconds),
    });
    if (result.timedOut) throw new Error(`Code Lab 运行超过 ${timeoutSeconds} 秒，已停止`);
    if (result.stdoutStderrLimitExceeded) {
      throw new Error("Code Lab 控制台输出超过套餐安全限制，已停止");
    }
    if (result.outputLimitExceeded) {
      throw new Error("Code Lab 输出文件超过套餐安全限制，未发布不完整结果");
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `Code Lab 退出码 ${result.exitCode ?? "未知"}：${
          result.stderr.trim().slice(0, 1_500) || result.stdout.trim().slice(0, 1_500) || "无错误输出"
        }`
      );
    }
    await upsertSkillRunStep({
      id: executeStep,
      runId: run.id,
      kind: "tool",
      label: `运行 ${language} 代码`,
      status: "completed",
      progress: 100,
      result: { exitCode: result.exitCode, durationMs: result.durationMs },
    });

    if (controller.signal.aborted) throw abortError();
    await updateSkillRun(run.id, { stage: "保存输出文件", progress: 88 });
    const publishStep = await upsertSkillRunStep({
      id: `${run.id}-publish`,
      runId: run.id,
      kind: "artifact",
      label: "保存输出文件",
      status: "running",
    });
    const attachments = await persistCodeSandboxOutputs(
      run.ownerId,
      result.outputFiles
    );
    await upsertSkillRunStep({
      id: publishStep,
      runId: run.id,
      kind: "artifact",
      label: "保存输出文件",
      status: "completed",
      progress: 100,
      result: { attachmentCount: attachments.length },
    });
    await updateSkillRun(run.id, {
      status: "completed",
      stage: "运行完成",
      progress: 100,
      error: null,
      result: {
        summary: compactConsole(result.stdout, result.stderr),
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        sandboxPolicy: policySummary,
        attachments,
      },
    });
  } finally {
    clearInterval(cancellationTimer);
  }
}

function sandboxLanguage(value: unknown): SandboxLanguage | null {
  if (value === "python" || value === "bash") return value;
  if (value === "node" || value === "javascript" || value === "js") return "node";
  return null;
}

function sandboxInputs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 32).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const attachmentId = stringValue(record.attachmentId);
    if (!attachmentId) return [];
    return [{ attachmentId, path: stringValue(record.path) || undefined }];
  });
}

function stringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, limit)
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compactConsole(stdout: string, stderr: string) {
  const sections = [
    stdout.trim() ? `stdout:\n${stdout.trim().slice(0, 6_000)}` : "stdout：（无输出）",
    stderr.trim() ? `stderr:\n${stderr.trim().slice(0, 2_000)}` : "",
  ].filter(Boolean);
  return sections.join("\n\n");
}

function abortError() {
  const error = new Error("Code Lab 已停止");
  error.name = "AbortError";
  return error;
}

import "server-only";

import { generateText, stepCountIs, type ToolSet } from "ai";

export interface SubagentTask {
  id: string;
  title: string;
  instruction: string;
}

export interface SubagentResult {
  taskId: string;
  title: string;
  status: "completed" | "failed" | "cancelled";
  summary: string;
  sourceCount: number;
  usage: { inputTokens: number; outputTokens: number };
  error?: string;
}

type GenerateModel = Parameters<typeof generateText>[0]["model"];
type GenerateTextInput = Parameters<typeof generateText>[0];

const SUBAGENT_MODEL_ATTEMPTS = 2;

/**
 * 运行一层受限 Subagent。禁止递归委派；每个任务只获得调用方显式提供的工具白名单。
 */
export async function runParallelSubagents(input: {
  model: GenerateModel;
  tasks: SubagentTask[];
  system: string;
  buildTools?: (task: SubagentTask) => Promise<ToolSet> | ToolSet;
  maxConcurrency?: number;
  maxSteps?: number;
  signal?: AbortSignal;
  onTaskStarted?: (task: SubagentTask) => Promise<void> | void;
  onTaskFinished?: (result: SubagentResult) => Promise<void> | void;
}) {
  const concurrency = Math.min(Math.max(input.maxConcurrency ?? 3, 1), 6);
  const results = new Array<SubagentResult>(input.tasks.length);
  let cursor = 0;

  const runOne = async (task: SubagentTask): Promise<SubagentResult> => {
    if (input.signal?.aborted) return cancelled(task);
    await input.onTaskStarted?.(task);
    try {
      const result = await generateSubagentText({
        model: input.model,
        system: [
          input.system,
          "你是一个有明确边界的研究子任务执行者。只处理当前子任务，不创建或模拟其他 Subagent。",
          "返回可供上层协调器合并的结论、证据和来源；不要输出思维过程。",
        ].join("\n\n"),
        prompt: `子任务：${task.title}\n\n${task.instruction}`,
        tools: (await input.buildTools?.(task)) ?? {},
        stopWhen: stepCountIs(Math.min(Math.max(input.maxSteps ?? 8, 1), 16)),
        abortSignal: input.signal,
      });
      let summary = result.text.trim();
      let inputTokens = result.usage.inputTokens ?? 0;
      let outputTokens = result.usage.outputTokens ?? 0;

      // 模型可能在最后一步仍选择工具，恰好触发 stepCountIs 后没有生成最终文本。
      // 这不代表子任务完成；用已取得的工具证据做一次无工具收尾，避免空摘要被标成成功。
      if (!summary && result.toolResults.length > 0 && !input.signal?.aborted) {
        const finalized = await generateSubagentText({
          model: input.model,
          system: [
            input.system,
            "你正在为已经完成检索的子任务整理最终结果。只能使用下面提供的工具结果，不再调用工具。",
            "输出结论、证据、可访问来源 URL 和不确定性；不要输出思维过程。",
          ].join("\n\n"),
          prompt: [
            `子任务：${task.title}`,
            task.instruction,
            "工具结果：",
            compactToolEvidence(result.toolResults),
          ].join("\n\n"),
          abortSignal: input.signal,
          maxOutputTokens: 2_500,
        });
        summary = finalized.text.trim();
        inputTokens += finalized.usage.inputTokens ?? 0;
        outputTokens += finalized.usage.outputTokens ?? 0;
      }
      if (!summary) {
        return {
          taskId: task.id,
          title: task.title,
          status: "failed",
          summary: "",
          sourceCount: 0,
          usage: { inputTokens, outputTokens },
          error: "子任务未生成可合并的结论，请重试或缩小调研范围",
        };
      }
      const urls = new Set(summary.match(/https?:\/\/[^\s)\]}>"']+/gu) ?? []);
      return {
        taskId: task.id,
        title: task.title,
        status: "completed",
        summary,
        sourceCount: urls.size,
        usage: {
          inputTokens,
          outputTokens,
        },
      };
    } catch (error) {
      if (input.signal?.aborted) return cancelled(task);
      return {
        taskId: task.id,
        title: task.title,
        status: "failed",
        summary: "",
        sourceCount: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
        error: formatSubagentError(error),
      };
    }
  };

  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= input.tasks.length) return;
      const result = await runOne(input.tasks[index]);
      results[index] = result;
      await input.onTaskFinished?.(result);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, input.tasks.length) }, () => worker())
  );
  return results;
}

/**
 * OpenAI 兼容中转偶尔会对同一份合法工具请求返回空 400，或返回无法通过 SDK
 * schema 校验的 200 JSON。AI SDK 不会重试这两类响应；子任务层补一次有限重试，
 * 避免一个瞬时网关错误让整份并行调研直接失败。
 */
async function generateSubagentText(options: GenerateTextInput) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SUBAGENT_MODEL_ATTEMPTS; attempt += 1) {
    try {
      return await generateText({
        ...options,
        // 子任务只调用联网/MCP 工具；单个失联网页不能拖住整个研究 Run。
        timeout: options.timeout ?? { toolMs: 45_000 },
      });
    } catch (error) {
      lastError = error;
      const retryable = attempt < SUBAGENT_MODEL_ATTEMPTS && isRetryableSubagentError(error);
      console.error(
        "[subagent] 模型调用失败",
        JSON.stringify({
          attempt,
          retryable,
          ...safeModelErrorDetails(error),
        })
      );
      if (!retryable || options.abortSignal?.aborted) throw error;
      await abortableDelay(300 * attempt, options.abortSignal);
    }
  }
  throw lastError;
}

function isRetryableSubagentError(error: unknown): boolean {
  const chain = errorChain(error);
  const statuses = chain
    .map((item) => numberProperty(item, "statusCode"))
    .filter((status): status is number => status !== null);
  if (statuses.some((status) => status === 408 || status === 409 || status === 429 || status >= 500)) {
    return true;
  }
  const message = chain
    .map((item) => (item instanceof Error ? item.message : ""))
    .join(" ");
  return /invalid json response|bad request|empty response|fetch failed|network|socket|timed?\s*out|connection/i.test(
    message
  );
}

function formatSubagentError(error: unknown): string {
  const details = safeModelErrorDetails(error);
  const status = details.statusCode ? `（HTTP ${details.statusCode}）` : "";
  const detail = details.responseDetail || details.message;
  return `上游模型响应异常${status}${detail ? `：${detail}` : "，请稍后重试"}`.slice(0, 1_000);
}

function safeModelErrorDetails(error: unknown) {
  const chain = errorChain(error);
  const statusCode = chain
    .map((item) => numberProperty(item, "statusCode"))
    .find((status) => status !== null);
  const responseBody = chain
    .map((item) => stringProperty(item, "responseBody"))
    .find((value) => value);
  const message = chain
    .map((item) => (item instanceof Error ? item.message : ""))
    .find((value) => value) ?? "Subagent 执行失败";
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    message: sanitizeDiagnostic(message, 500),
    statusCode: statusCode ?? undefined,
    responseDetail: responseBody ? sanitizeDiagnostic(extractResponseDetail(responseBody), 500) : undefined,
  };
}

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    chain.push(current);
    if (!current || typeof current !== "object") break;
    const obj = current as Record<string, unknown>;
    current = obj.lastError ?? obj.cause;
  }
  return chain;
}

function numberProperty(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object") return null;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "number" ? found : null;
}

function stringProperty(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" ? found : "";
}

function extractResponseDetail(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "上游返回了空响应";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const nested = obj.error && typeof obj.error === "object"
        ? (obj.error as Record<string, unknown>).message
        : undefined;
      const message = [nested, obj.message, obj.error].find(
        (item) => typeof item === "string" && item.trim()
      );
      if (typeof message === "string") return message;
    }
  } catch {
    // 非 JSON 响应只保留安全的纯文本摘要。
  }
  return trimmed;
}

function sanitizeDiagnostic(value: string, maxLength: number): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|authorization)["'\s:=]+[^\s,"'}]+/gi, "$1=[REDACTED]")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function abortableDelay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function compactToolEvidence(
  results: ReadonlyArray<{ toolName: string; output: unknown }>
): string {
  const limit = 24_000;
  let evidence = "";
  for (const result of results.slice(-12)) {
    let serialized: string;
    try {
      serialized = JSON.stringify(result.output);
    } catch {
      serialized = String(result.output);
    }
    const chunk = `## ${result.toolName}\n${serialized.slice(0, 5_000)}\n\n`;
    if (evidence.length + chunk.length > limit) {
      evidence += chunk.slice(0, Math.max(0, limit - evidence.length));
      break;
    }
    evidence += chunk;
  }
  return evidence || "（工具没有返回可用内容）";
}

function cancelled(task: SubagentTask): SubagentResult {
  return {
    taskId: task.id,
    title: task.title,
    status: "cancelled",
    summary: "",
    sourceCount: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

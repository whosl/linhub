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
      const result = await generateText({
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
      const summary = result.text.trim();
      const urls = new Set(summary.match(/https?:\/\/[^\s)\]}>"']+/gu) ?? []);
      return {
        taskId: task.id,
        title: task.title,
        status: "completed",
        summary,
        sourceCount: urls.size,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
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
        error: error instanceof Error ? error.message.slice(0, 1_000) : "Subagent 执行失败",
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

// WorkProcessSummary 的汇总逻辑(纯函数,可单测):
// 把一条 assistant 消息里的 tool-call parts 汇总成「已执行 N 步:联网搜索 ×2、运行代码 ×1」

import type { MessagePart, ToolCallPart } from "../api/types";
import { toolDisplayName } from "./tool-names";

export interface ToolCallSummaryEntry {
  toolName: string;
  label: string;
  count: number;
  /** 该工具任意一次调用失败即为 true */
  hasError: boolean;
}

export interface ToolCallSummary {
  total: number;
  /** 是否仍有 running 的调用 */
  running: boolean;
  entries: ToolCallSummaryEntry[];
  parts: ToolCallPart[];
}

/** 汇总消息中的工具调用(保持出现顺序) */
export function summarizeToolCalls(parts: MessagePart[]): ToolCallSummary {
  const calls = parts.filter(
    (p): p is ToolCallPart => p.type === "tool-call",
  );
  const entries: ToolCallSummaryEntry[] = [];
  const byName = new Map<string, ToolCallSummaryEntry>();
  let running = false;
  for (const c of calls) {
    if (c.state === "running") running = true;
    let entry = byName.get(c.toolName);
    if (!entry) {
      entry = {
        toolName: c.toolName,
        label: toolDisplayName(c.toolName),
        count: 0,
        hasError: false,
      };
      byName.set(c.toolName, entry);
      entries.push(entry);
    }
    entry.count += 1;
    if (c.state === "error") entry.hasError = true;
  }
  return { total: calls.length, running, entries, parts: calls };
}

/** 汇总行文案:「联网搜索 ×2、运行代码 ×1」 */
export function formatToolSummary(summary: ToolCallSummary): string {
  return summary.entries.map((e) => `${e.label} ×${e.count}`).join("、");
}

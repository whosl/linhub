// 工作过程汇总:把一条 assistant 消息的工具调用折叠成一行,可展开看全部卡片

import { useState } from "react";
import type { MessagePart } from "@/api/types";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { formatToolSummary, summarizeToolCalls } from "@/lib/tool-summary";
import { ToolCallCard } from "./ToolCallCard";

export function WorkProcessSummary({ parts }: { parts: MessagePart[] }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeToolCalls(parts);
  if (summary.total === 0) return null;

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text-2 transition-colors hover:bg-surface-2"
      >
        {summary.running ? (
          <Spinner className="size-3" />
        ) : (
          <span aria-hidden className="text-success">✓</span>
        )}
        <span>
          {summary.running ? "正在执行" : "已执行"} {summary.total} 步:
          {formatToolSummary(summary)}
        </span>
        <span
          aria-hidden
          className={cn("text-text-3 transition-transform", open && "rotate-90")}
        >
          ▸
        </span>
      </button>
      {open && (
        <div className="mt-1.5">
          {summary.parts.map((p) => (
            <ToolCallCard key={p.toolCallId} part={p} />
          ))}
        </div>
      )}
    </div>
  );
}

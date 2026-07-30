"use client";

import * as React from "react";
import {
  BrainCircuitIcon,
  BrainIcon,
  ChevronDownIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeReasoningText } from "@/lib/chat-text";
import type { MessagePart } from "@/lib/types";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToolCallCard } from "./tool-call-card";

type WorkPart = Extract<MessagePart, { type: "reasoning" | "tool-call" }>;

export function WorkProcessSummary({
  parts,
  isStreaming,
}: {
  parts: WorkPart[];
  isStreaming: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const errorCount = parts.filter(
    (part) => part.type === "tool-call" && part.state === "error"
  ).length;
  const durationMs = parts.reduce(
    (total, part) => total + (part.type === "reasoning" ? part.durationMs ?? 0 : 0),
    0
  );
  const duration = durationMs > 0 ? formatDuration(durationMs) : null;

  React.useEffect(() => {
    if (!isStreaming) Promise.resolve().then(() => setExpanded(false));
  }, [isStreaming]);

  if (parts.length === 0) return null;

  const title = isStreaming
    ? `工作中 · ${parts.length} 个步骤`
    : `工作过程 · ${parts.length} 个步骤${duration ? ` · ${duration}` : ""}`;

  return (
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <div className="my-1.5 first:mt-0">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex max-w-full items-center gap-2 rounded-lg py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={expanded}
        >
          {isStreaming ? (
            <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
          ) : (
            <BrainCircuitIcon className="size-3.5 shrink-0" />
          )}
          <span className={cn("truncate", isStreaming && "animate-thinking")}>
            {title}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0" />
        </button>
      </div>

      <DialogContent
        hideClose
        className="bottom-0 left-1/2 top-auto flex h-[min(92dvh,760px)] w-full max-w-3xl -translate-x-1/2 translate-y-0 flex-col gap-0 overflow-hidden rounded-b-none rounded-t-3xl p-0 data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
      >
        <div className="relative shrink-0 border-b px-14 pb-4 pt-5 text-center">
          <span className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />
          <DialogTitle>{title}</DialogTitle>
          {errorCount > 0 && (
            <p className="mt-1 text-xs text-destructive">{errorCount} 个步骤执行失败</p>
          )}
          <DialogClose
            type="button"
            aria-label="关闭工作过程"
            className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-4" />
          </DialogClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 sm:px-8">
          <div className="space-y-2 border-l border-border pl-3">
            {parts.map((part, index) =>
              part.type === "reasoning" ? (
                <ReasoningStep key={`reasoning-${index}`} part={part} />
              ) : (
                <ToolCallCard
                  key={part.toolCallId || `tool-${index}`}
                  part={part}
                  showDeliverables={false}
                />
              )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReasoningStep({ part }: { part: Extract<WorkPart, { type: "reasoning" }> }) {
  const text = sanitizeReasoningText(part.text);
  return (
    <div className="rounded-lg bg-muted/35 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <BrainIcon className="size-3.5" />
        <span>思考</span>
        {part.durationMs ? <span>· {formatDuration(part.durationMs)}</span> : null}
      </div>
      {text && (
        <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

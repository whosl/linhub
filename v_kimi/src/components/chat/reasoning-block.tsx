"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeReasoningText } from "@/lib/chat-text";
import type { ReasoningPart } from "@/lib/types";

export function ReasoningBlock({
  part,
  isStreaming,
  keepOpen,
}: {
  part: ReasoningPart;
  /** 当前 reasoning part 是否还在接收增量。 */
  isStreaming: boolean;
  /** assistant 正在生成正文时，保留已产生的思考内容展开显示。 */
  keepOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const displayText = sanitizeReasoningText(part.text);
  const hasText = displayText.length > 0;

  // 思考和正文仍在流式生成时保持展开；整条消息完成后自动收起。
  React.useEffect(() => {
    Promise.resolve().then(() => setOpen(isStreaming || Boolean(keepOpen && hasText)));
  }, [hasText, isStreaming, keepOpen]);

  const seconds = part.durationMs ? Math.max(1, Math.round(part.durationMs / 1000)) : null;

  return (
    <div className="my-2 first:mt-0">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 -ml-2.5 rounded-full px-2.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        )}
      >
        <BrainIcon className="size-3.5" />
        {isStreaming ? (
          <span className="animate-thinking font-medium">思考中…</span>
        ) : (
          <span>已深度思考{seconds ? `（用时 ${seconds} 秒）` : ""}</span>
        )}
        <ChevronDownIcon
          className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && hasText && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 whitespace-pre-wrap rounded-r-xl border-l-2 border-primary/40 bg-muted/30 py-2.5 pl-3.5 pr-3 text-[13px] leading-relaxed text-muted-foreground">
              {displayText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

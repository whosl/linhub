"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  FileIcon,
  Loader2Icon,
  PencilIcon,
  QuoteIcon,
  RefreshCwIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import type { Message, Model } from "@/lib/types";
import { MarkdownRenderer } from "./markdown/markdown-renderer";
import { ToolResultDeliverables } from "./tool-call-card";
import { WorkProcessSummary } from "./work-process-summary";
import {
  SkillRunLiveCard,
  type SkillRunAttachment,
} from "./skill-run-card";
import { ImageLightbox } from "./image-lightbox";
import { Tooltip } from "@/components/ui/tooltip";
import { CopyFallbackDialog } from "@/components/ui/copy-fallback-dialog";
import { copyTextToClipboard } from "@/lib/clipboard";
import { sanitizeAssistantText } from "@/lib/chat-text";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export interface BranchInfo {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function MessageItem({
  message,
  isStreaming,
  models,
  branch,
  onRegenerate,
  onEditResend,
  onRetrySend,
  onFeedback,
  onQuote,
  onOpenArtifact,
  onOpenAttachment,
  onImageEdited,
}: {
  message: Message;
  isStreaming: boolean;
  models: Model[];
  branch?: BranchInfo;
  onRegenerate?: (modelId?: string) => void;
  onEditResend?: (newText: string) => void;
  onRetrySend?: () => void;
  onFeedback?: (fb: "up" | "down" | null) => void;
  onQuote?: (text: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenAttachment?: (attachment: SkillRunAttachment, runId: string) => void;
  /** lightbox 编辑图片后，替换消息里的旧图（乐观更新） */
  onImageEdited?: (
    oldUrl: string,
    newUrl: string,
    editPrompt?: string
  ) => void | Promise<void>;
}) {
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState("");
  const [manualCopyText, setManualCopyText] = React.useState<string | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [selection, setSelection] = React.useState<{ text: string; x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = React.useState<{ src: string; alt?: string } | null>(null);

  const textContent = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => (message.role === "assistant" ? sanitizeAssistantText(p.text) : p.text))
    .join("\n");
  const routingConfig = message.parts.find(
    (p): p is Extract<Message["parts"][number], { type: "tool-config" }> =>
      p.type === "tool-config" && (p.routing?.labels.length ?? 0) > 0
  );
  const routingDecision = routingConfig?.routing;

  const copy = async () => {
    try {
      await copyTextToClipboard(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setManualCopyText(textContent);
    }
  };

  // 选中文本 → 引用回复
  const handleMouseUp = () => {
    if (message.role !== "assistant" || !onQuote) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || !sel || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!contentRef.current?.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current.getBoundingClientRect();
    setSelection({
      text,
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.top - containerRect.top,
    });
  };

  const modelName = models.find((m) => m.id === message.modelId)?.displayName;
  const lightboxNode = (
    <ImageLightbox
      src={lightbox?.src ?? ""}
      alt={lightbox?.alt}
      open={!!lightbox}
      onOpenChange={(o) => !o && setLightbox(null)}
      onEdited={
        onImageEdited && lightbox
          ? async (newUrl, editPrompt) => {
              await onImageEdited(lightbox.src, newUrl, editPrompt);
              setLightbox(null);
            }
          : undefined
      }
    />
  );
  const copyFallbackNode = (
    <CopyFallbackDialog
      text={manualCopyText}
      onClose={() => setManualCopyText(null)}
    />
  );

  // ---------- 用户消息 ----------
  if (message.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="group flex flex-col items-end gap-1"
      >
        {message.quotedText && (
          <div className="max-w-[75%] rounded-t-xl rounded-bl-xl border-l-2 border-primary/50 bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground line-clamp-2">
            {message.quotedText}
          </div>
        )}
        {message.parts.map((part, i) => {
          if (part.type === "image") {
            const src =
              part.mediaAssetId != null
                ? `/api/media/${part.mediaAssetId}`
                : part.url;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={part.alt ?? "上传的图片"}
                onClick={() => setLightbox({ src, alt: part.alt })}
                className="max-h-64 max-w-[75%] cursor-zoom-in rounded-2xl border transition-opacity hover:opacity-90"
              />
            );
          }
          if (part.type === "file") {
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5"
              >
                <FileIcon className="size-6 text-primary" />
                <div>
                  <p className="text-sm font-medium">{part.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(part.size)}</p>
                </div>
              </div>
            );
          }
          if (part.type === "text") {
            return editing ? (
              <div key={i} className="w-full max-w-[85%]">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                  rows={Math.min(8, editText.split("\n").length + 1)}
                  className="w-full resize-none rounded-2xl border bg-card px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-ring/40"
                />
                <div className="mt-1.5 flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    aria-label="取消编辑"
                    className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      if (editText.trim() && editText !== part.text)
                        onEditResend?.(editText.trim());
                    }}
                    aria-label="发送编辑后的消息"
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    发送
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={i}
                className="min-w-0 max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bubble-user px-4 py-2.5 text-[15px] leading-relaxed text-bubble-user-foreground [overflow-wrap:anywhere]"
              >
                {part.text}
              </div>
            );
          }
          return null;
        })}

        {message.deliveryState === "sending" && (
          <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            正在发送…
          </div>
        )}
        {message.deliveryState === "failed" && (
          <div className="flex max-w-[85%] items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
            <span className="min-w-0 flex-1 truncate">
              {message.deliveryError || "发送失败"}
            </span>
            {onRetrySend && (
              <button
                type="button"
                onClick={onRetrySend}
                className="shrink-0 rounded-md px-2 py-1 font-medium hover:bg-destructive/10"
              >
                重试
              </button>
            )}
          </div>
        )}

        {routingDecision && (
          <div className="flex max-w-[85%] items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
            <SparklesIcon className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">
              已自动选择：{routingDecision.labels.join("、")}
            </span>
          </div>
        )}

        {/* 用户消息操作 */}
        {!editing && (
          <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {branch && branch.total > 1 && <BranchSwitcher branch={branch} />}
            {onEditResend && (
              <Tooltip label="编辑并重发">
                <button
                  type="button"
                  aria-label="编辑并重发"
                  onClick={() => {
                    setEditText(textContent);
                    setEditing(true);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <PencilIcon className="size-3.5" />
                </button>
              </Tooltip>
            )}
            <Tooltip label={copied ? "已复制" : "复制"}>
              <button
                type="button"
                aria-label={copied ? "已复制" : "复制"}
                onClick={copy}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
              </button>
            </Tooltip>
          </div>
        )}
        {copyFallbackNode}
        {lightboxNode}
      </motion.div>
    );
  }

  // ---------- 助手消息 ----------
  const isEmpty = message.parts.length === 0;
  const hasCopyableText = textContent.trim().length > 0;
  const showActionBar =
    !isStreaming && (!isEmpty || message.status === "stopped");
  const workParts = message.parts.filter(
    (part): part is Extract<Message["parts"][number], { type: "reasoning" | "tool-call" }> =>
      part.type === "reasoning" || part.type === "tool-call"
  );
  const toolParts = workParts.filter(
    (part): part is Extract<Message["parts"][number], { type: "tool-call" }> =>
      part.type === "tool-call"
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="group relative"
      onMouseUp={handleMouseUp}
    >
      <div ref={contentRef} className="relative">
        {/* 空态：等待第一个 token */}
        {isEmpty && isStreaming && (
          <div className="flex items-center gap-2 py-1">
            <span className="size-2.5 animate-pulse rounded-full bg-primary" />
            <span className="animate-thinking text-sm">正在思考…</span>
          </div>
        )}

        <WorkProcessSummary parts={workParts} isStreaming={isStreaming} />

        {toolParts.map((part) => (
          <ToolResultDeliverables
            key={`deliverable-${part.toolCallId}`}
            part={part}
            onOpenArtifact={onOpenArtifact}
            onOpenAttachment={onOpenAttachment}
          />
        ))}

        {message.parts.map((part, i) => {
          const isLast = i === message.parts.length - 1;
          switch (part.type) {
            case "skill-run":
              return (
                <SkillRunLiveCard
                  key={part.runId}
                  runId={part.runId}
                  skillName={part.skillName}
                  onOpenAttachment={onOpenAttachment}
                />
              );
            case "reasoning":
              return null;
            case "tool-call":
              return null;
            case "text":
              const displayText = sanitizeAssistantText(part.text);
              if (!displayText && !isStreaming) return null;
              return (
                <div key={i} className={cn(isStreaming && isLast && "streaming-cursor")}>
                  <MarkdownRenderer content={displayText} isStreaming={isStreaming && isLast} />
                </div>
              );
            case "image": {
              const src =
                part.mediaAssetId != null
                  ? `/api/media/${part.mediaAssetId}`
                  : part.url;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={part.alt ?? "生成的图片"}
                  onClick={() => setLightbox({ src, alt: part.alt })}
                  className="my-3 max-h-96 cursor-zoom-in rounded-2xl border shadow-sm transition-opacity hover:opacity-90"
                />
              );
            }
            default:
              return null;
          }
        })}

        {message.status === "stopped" && (
          <p className="mt-2 text-xs text-muted-foreground">已停止生成</p>
        )}

        {/* 选中引用浮层 */}
        {selection && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ left: selection.x, top: selection.y - 36 }}
            className="absolute z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg"
            onMouseDown={(e) => {
              e.preventDefault();
              onQuote?.(selection.text);
              setSelection(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <QuoteIcon className="size-3" />
            引用
          </motion.button>
        )}
      </div>

      {/* 助手消息操作栏 */}
      {showActionBar && (
        <div className="mt-1 flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {branch && branch.total > 1 && <BranchSwitcher branch={branch} />}
          {hasCopyableText && (
            <Tooltip label={copied ? "已复制" : "复制"}>
              <button onClick={copy} aria-label={copied ? "已复制" : "复制"} className="action-btn rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
              </button>
            </Tooltip>
          )}
          {onRegenerate && (
            <DropdownMenu>
              <Tooltip label="重新生成">
                <DropdownMenuTrigger asChild>
                  <button aria-label="重新生成" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                    <RefreshCwIcon className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => onRegenerate()}>
                  <RefreshCwIcon /> 重新生成
                </DropdownMenuItem>
                <DropdownMenuLabel>换个模型试试</DropdownMenuLabel>
                {models
                  .filter((m) => !m.capabilities.includes("image-generation"))
                  .map((m) => (
                    <DropdownMenuItem key={m.id} onClick={() => onRegenerate(m.id)}>
                      {m.displayName}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onFeedback && (
            <>
              <Tooltip label="有帮助">
                <button
                  onClick={() => onFeedback(message.feedback === "up" ? null : "up")}
                  aria-label="有帮助"
                  className={cn(
                    "rounded-md p-1.5 transition-colors hover:bg-accent",
                    message.feedback === "up" ? "text-success" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ThumbsUpIcon className="size-3.5" />
                </button>
              </Tooltip>
              <Tooltip label="没帮助">
                <button
                  onClick={() => onFeedback(message.feedback === "down" ? null : "down")}
                  aria-label="没帮助"
                  className={cn(
                    "rounded-md p-1.5 transition-colors hover:bg-accent",
                    message.feedback === "down" ? "text-destructive" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ThumbsDownIcon className="size-3.5" />
                </button>
              </Tooltip>
            </>
          )}
          {hasCopyableText && <SpeakButton message={message} />}
          {modelName && (
            <span className="ml-1.5 text-[11px] text-muted-foreground">{modelName}</span>
          )}
        </div>
      )}
      {/* 图片全屏预览 */}
      {copyFallbackNode}
      {lightboxNode}
    </motion.div>
  );
}

/** MiMo TTS 朗读按钮：合成后播放，再次点击停止 */
function SpeakButton({ message }: { message: Message }) {
  const [state, setState] = React.useState<"idle" | "loading" | "playing">("idle");
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  // C4: 记录当前播放音频的 blob URL 以便释放（synthesizeSpeech 返回的是 blob URL）
  const audioUrlRef = React.useRef<string | null>(null);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setState("idle");
  };

  React.useEffect(() => stop, []);

  const speak = async () => {
    if (state === "playing" || state === "loading") {
      stop();
      return;
    }
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .replace(/```[\s\S]*?```/g, "（代码块）")
      .trim();
    if (!text) return;
    setState("loading");
    try {
      const { getDataService } = await import("@/lib/data");
      const { audioUrl } = await getDataService().synthesizeSpeech(text.slice(0, 2000));
      audioUrlRef.current = audioUrl; // C4
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = stop;
      audio.onerror = stop;
      await audio.play();
      setState("playing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "朗读失败");
      stop();
    }
  };

  return (
    <Tooltip label={state === "playing" ? "停止朗读" : state === "loading" ? "生成语音中…" : "朗读"}>
      <button
        onClick={speak}
        aria-label={state === "playing" ? "停止朗读" : "朗读"}
        className={cn(
          "rounded-md p-1.5 transition-colors hover:bg-accent hover:text-foreground",
          state === "idle" ? "text-muted-foreground" : "text-primary"
        )}
      >
        {state === "loading" ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : state === "playing" ? (
          <VolumeXIcon className="size-3.5" />
        ) : (
          <Volume2Icon className="size-3.5" />
        )}
      </button>
    </Tooltip>
  );
}

function BranchSwitcher({ branch }: { branch: BranchInfo }) {
  return (
    <span className="mr-1 flex items-center gap-0.5 text-xs text-muted-foreground">
      <button
        onClick={branch.onPrev}
        disabled={branch.index <= 0}
        aria-label="上一分支"
        className="rounded p-0.5 transition-colors hover:bg-accent disabled:opacity-40"
      >
        <ChevronLeftIcon className="size-3.5" />
      </button>
      <span className="font-mono tabular-nums">
        {branch.index + 1}/{branch.total}
      </span>
      <button
        onClick={branch.onNext}
        disabled={branch.index >= branch.total - 1}
        aria-label="下一分支"
        className="rounded p-0.5 transition-colors hover:bg-accent disabled:opacity-40"
      >
        <ChevronRightIcon className="size-3.5" />
      </button>
    </span>
  );
}

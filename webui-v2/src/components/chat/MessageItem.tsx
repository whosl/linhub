// 单条消息完整渲染:user 右对齐气泡 / assistant 全宽,按 part 类型分发渲染
// 操作条:hover 显示;复制 / 重新生成(可选模型)/ 分支切换 / 反馈 / 编辑(user)

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getModels } from "@/api/models";
import type {
  Message,
  MessagePart,
  ReasoningPart,
} from "@/api/types";
import { DropdownItem, DropdownMenu } from "@/components/ui/DropdownMenu";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";
import { siblingBranches, type ChatSession } from "@/stores/chat-core";
import { useChatStore } from "@/stores/chat-store";
import { useTtsStore } from "@/stores/tts-store";
import { ImageMaskEditor } from "./ImageMaskEditor";
import { Lightbox } from "./Lightbox";
import { SkillRunCard } from "./SkillRunCard";
import { ToolCallCard } from "./ToolCallCard";
import { WorkProcessSummary } from "./WorkProcessSummary";
import { MarkdownRenderer } from "./markdown/MarkdownRenderer";

function messageText(parts: MessagePart[]): string {
  return parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** 引用文本:全部 text part 拼接,截断 500 字 */
function quoteText(parts: MessagePart[]): string {
  const t = messageText(parts).trim();
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
}

/** 消息顶部的引用块(左边框灰色小字) */
function QuoteBlock({ text }: { text: string }) {
  return (
    <div className="mb-1.5 border-l-2 border-border pl-2.5">
      <p className="line-clamp-3 text-xs leading-5 break-words whitespace-pre-wrap text-text-3">
        {text}
      </p>
    </div>
  );
}

function lastTextIndex(parts: MessagePart[]): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i]!.type === "text") return i;
  }
  return -1;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("zh-CN", { hour12: false });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MessageItem({
  message,
  session,
  isStreamingThis,
  onQuote,
}: {
  message: Message;
  session: ChatSession;
  isStreamingThis: boolean;
  /** 引用该消息(text 已截断) */
  onQuote?: (quotedText: string) => void;
}) {
  if (message.role === "skill-run-receipt") {
    return (
      <div className="flex items-center gap-3 py-1" data-msg-id={message.id}>
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-text-3">技能运行完成回执</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }
  if (message.role === "user") {
    return (
      <UserMessage message={message} session={session} onQuote={onQuote} />
    );
  }
  return (
    <AssistantMessage
      message={message}
      session={session}
      isStreamingThis={isStreamingThis}
      onQuote={onQuote}
    />
  );
}

// ---------------------------------------------------------------------------
// user 消息
// ---------------------------------------------------------------------------

function UserMessage({
  message,
  session,
  onQuote,
}: {
  message: Message;
  session: ChatSession;
  onQuote?: (quotedText: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const retrySend = useChatStore((s) => s.retrySend);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const text = messageText(message.parts);
  const toolConfig = message.parts.find(
    (p): p is Extract<MessagePart, { type: "tool-config" }> =>
      p.type === "tool-config",
  );
  const routing = toolConfig?.routing;
  const siblings = siblingBranches(session.messages, message.id);

  const startEdit = () => {
    setDraft(text);
    setEditing(true);
  };

  /** 编辑重发:以该消息的 parent 为新 parent 发送,形成新分支 */
  const saveEdit = () => {
    const newText = draft.trim();
    if (!newText) return;
    setEditing(false);
    void useChatStore.getState().send(session.conversationId, {
      text: newText,
      parentId: message.parentId ?? undefined,
      tools: toolConfig?.tools ?? {
        webSearch: false,
        imageGeneration: false,
        codeRunner: false,
        knowledgeSearch: false,
        mcpServerIds: [],
        knowledgeBaseIds: [],
      },
      extendedThinking: false,
    });
  };

  return (
    <div className="group flex flex-row-reverse items-start gap-2.5" data-msg-id={message.id}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary">
        {(user?.name || user?.email || "我").slice(0, 1).toUpperCase()}
      </span>
      <div className="flex max-w-[85%] flex-col items-end gap-1">
        {editing ? (
          <div className="w-[min(32rem,70vw)] rounded-2xl border border-border bg-surface p-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              className="w-full resize-none bg-transparent text-sm text-text outline-none"
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-1 text-xs text-text-2 hover:bg-surface-2"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!draft.trim()}
                className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-on-primary hover:bg-primary-hover disabled:opacity-40"
              >
                保存并重新发送
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 附件 / 图片 */}
            {message.parts.some((p) => p.type === "image" || p.type === "file") && (
              <div className="flex flex-wrap justify-end gap-2">
                {message.parts.map((p, i) =>
                  p.type === "image" ? (
                    <MessageImage key={i} url={p.url} alt={p.alt} />
                  ) : p.type === "file" ? (
                    <FileCard key={i} part={p} />
                  ) : null,
                )}
              </div>
            )}
            {text && (
              <div
                className={cn(
                  "rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap break-words text-text",
                  message.deliveryState === "sending" && "opacity-60",
                  message.deliveryState === "failed" &&
                    "border border-danger/40",
                )}
              >
                {message.quotedText && <QuoteBlock text={message.quotedText} />}
                {text}
              </div>
            )}
            {routing?.enabled && routing.labels && routing.labels.length > 0 && (
              <p className="text-xs text-text-3">
                智能路由:{routing.labels.join("、")}
              </p>
            )}
          </>
        )}

        {/* 投递状态 + hover 操作 */}
        <div className="flex items-center gap-1.5">
          {message.deliveryState === "sending" && (
            <Spinner className="size-3 text-text-3" />
          )}
          {message.deliveryState === "failed" && (
            <span className="flex items-center gap-1.5 text-xs text-danger">
              <span className="inline-block size-1.5 rounded-full bg-danger" />
              发送失败
              <button
                type="button"
                onClick={() => void retrySend(session.conversationId)}
                className="rounded-md border border-danger/40 px-1.5 py-0.5 hover:bg-danger-soft"
              >
                重试
              </button>
            </span>
          )}
          {!editing && message.status !== "streaming" && (
            <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <ActionButton label="复制" onClick={() => void copyText(text)} />
              {onQuote && text && (
                <ActionButton
                  label="引用"
                  onClick={() => onQuote(quoteText(message.parts))}
                />
              )}
              <ActionButton label="编辑" onClick={startEdit} />
              <BranchSwitch
                messageId={message.id}
                siblings={siblings}
                conversationId={session.conversationId}
              />
              <time className="ml-1 text-xs text-text-3">
                {formatTime(message.createdAt)}
              </time>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// assistant 消息
// ---------------------------------------------------------------------------

function AssistantMessage({
  message,
  session,
  isStreamingThis,
  onQuote,
}: {
  message: Message;
  session: ChatSession;
  isStreamingThis: boolean;
  onQuote?: (quotedText: string) => void;
}) {
  const toolCallCount = message.parts.filter((p) => p.type === "tool-call").length;
  // 多次工具调用时折叠为工作过程汇总,渲染位置 = 首个 tool-call part
  const summaryIndex =
    toolCallCount >= 2
      ? message.parts.findIndex((p) => p.type === "tool-call")
      : -1;
  const cursorAt = isStreamingThis ? lastTextIndex(message.parts) : -1;

  return (
    <div className="group flex items-start gap-2.5" data-msg-id={message.id}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm text-primary">
        ✦
      </span>
      <div className="min-w-0 flex-1">
        {message.quotedText && <QuoteBlock text={message.quotedText} />}
        <div>
          {message.parts.map((part, i) => {
            if (i === summaryIndex) {
              return <WorkProcessSummary key={i} parts={message.parts} />;
            }
            if (part.type === "tool-call" && summaryIndex >= 0) return null;
            return (
              <PartView
                key={i}
                part={part}
                messageId={message.id}
                showCursor={i === cursorAt}
              />
            );
          })}
          {isStreamingThis && message.parts.length === 0 && (
            <span className="inline-block size-2 animate-pulse rounded-full bg-text-3" />
          )}
        </div>
        {!isStreamingThis && message.status !== "streaming" && (
          <AssistantActions message={message} session={session} onQuote={onQuote} />
        )}
      </div>
    </div>
  );
}

function AssistantActions({
  message,
  session,
  onQuote,
}: {
  message: Message;
  session: ChatSession;
  onQuote?: (quotedText: string) => void;
}) {
  const setFeedback = useChatStore((s) => s.setFeedback);
  const regenerate = useChatStore((s) => s.regenerate);
  const ttsPlaying = useTtsStore((s) => s.playingId === message.id);
  const ttsLoading = useTtsStore((s) => s.loadingId === message.id);
  const { data: modelsData } = useQuery({
    queryKey: ["models"],
    queryFn: getModels,
    staleTime: 5 * 60_000,
  });
  const models = useMemo(
    () => (modelsData?.models ?? []).filter((m) => m.enabled),
    [modelsData],
  );
  const siblings = siblingBranches(session.messages, message.id);

  return (
    <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <ActionButton
        label="复制"
        onClick={() => void copyText(messageText(message.parts))}
      />
      {onQuote && messageText(message.parts).trim() && (
        <ActionButton
          label="引用"
          onClick={() => onQuote(quoteText(message.parts))}
        />
      )}
      <ActionButton
        label={ttsLoading ? "合成中…" : ttsPlaying ? "⏹ 停止" : "🔊 朗读"}
        active={ttsPlaying}
        onClick={() =>
          void useTtsStore.getState().play(message.id, messageText(message.parts))
        }
      />
      <DropdownMenu
        align="left"
        trigger={
          <span className="rounded-md px-1.5 py-0.5 text-xs text-text-3 transition-colors hover:bg-surface-2 hover:text-text">
            重新生成 ▾
          </span>
        }
      >
        <DropdownItem
          onClick={() => void regenerate(session.conversationId, message.id)}
        >
          使用当前模型
        </DropdownItem>
        {models.length > 0 && (
          <div className="my-1 border-t border-border" />
        )}
        {models.map((m) => (
          <DropdownItem
            key={m.id}
            onClick={() =>
              void regenerate(session.conversationId, message.id, m.id)
            }
          >
            {m.displayName}
          </DropdownItem>
        ))}
      </DropdownMenu>
      <BranchSwitch
        messageId={message.id}
        siblings={siblings}
        conversationId={session.conversationId}
      />
      <ActionButton
        label="👍"
        active={message.feedback === "up"}
        onClick={() =>
          void setFeedback(message.id, message.feedback === "up" ? null : "up")
        }
      />
      <ActionButton
        label="👎"
        active={message.feedback === "down"}
        onClick={() =>
          void setFeedback(message.id, message.feedback === "down" ? null : "down")
        }
      />
      <time className="ml-1 text-xs text-text-3">
        {formatTime(message.createdAt)}
      </time>
    </div>
  );
}

// ---------------------------------------------------------------------------
// part 渲染
// ---------------------------------------------------------------------------

function PartView({
  part,
  messageId,
  showCursor,
}: {
  part: MessagePart;
  /** assistant 消息 id,图片局部重绘后替换该消息的 image part */
  messageId: string;
  showCursor?: boolean;
}) {
  switch (part.type) {
    case "text":
      return (
        <div>
          <MarkdownRenderer content={part.text} />
          {showCursor && <span className="streaming-cursor" aria-hidden />}
        </div>
      );
    case "reasoning":
      return <ReasoningBlock part={part} />;
    case "tool-call":
      return <ToolCallCard part={part} />;
    case "image":
      return <MessageImage url={part.url} alt={part.alt} editMessageId={messageId} />;
    case "file":
      return <FileCard part={part} />;
    case "skill-run":
      return <SkillRunCard part={part} />;
    default:
      // tool-config 不直接渲染(user 消息在其下方显示路由信息)
      return null;
  }
}

function ReasoningBlock({ part }: { part: ReasoningPart }) {
  const [open, setOpen] = useState(false);
  const thinking = part.durationMs == null;
  return (
    <div className="my-2 rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-2 hover:bg-surface-2/60"
      >
        <span aria-hidden>🧠</span>
        {thinking ? (
          <span className="animate-pulse">正在思考…</span>
        ) : (
          <span>已思考 {((part.durationMs ?? 0) / 1000).toFixed(1)}s</span>
        )}
        <span
          aria-hidden
          className={cn(
            "ml-auto text-text-3 transition-transform",
            open && "rotate-90",
          )}
        >
          ▸
        </span>
      </button>
      {open && (
        <p className="border-t border-border px-3 py-2.5 text-xs leading-6 whitespace-pre-wrap break-words text-text-3">
          {part.text || "(无内容)"}
        </p>
      )}
    </div>
  );
}

function MessageImage({
  url,
  alt,
  editMessageId,
}: {
  url: string;
  alt?: string;
  /** 提供时 lightbox 显示「局部重绘」入口(仅 assistant 图片) */
  editMessageId?: string;
}) {
  const [lightbox, setLightbox] = useState(false);
  const [editing, setEditing] = useState(false);
  const replaceMessageImage = useChatStore((s) => s.replaceMessageImage);
  return (
    <>
      <img
        src={url}
        alt={alt ?? "图片"}
        loading="lazy"
        onClick={() => setLightbox(true)}
        className="my-2 max-w-xs cursor-zoom-in rounded-xl border border-border"
      />
      <Lightbox
        src={lightbox ? url : null}
        alt={alt}
        onClose={() => setLightbox(false)}
        onEdit={
          editMessageId
            ? () => {
                setLightbox(false);
                setEditing(true);
              }
            : undefined
        }
      />
      {editMessageId && (
        <ImageMaskEditor
          open={editing}
          src={url}
          onClose={() => setEditing(false)}
          onComplete={(newUrl, editPrompt) => {
            setEditing(false);
            void replaceMessageImage(editMessageId, url, newUrl, editPrompt).catch(
              (err: unknown) =>
                toast.error(
                  err instanceof Error ? err.message : "图片替换失败,请刷新重试",
                ),
            );
          }}
        />
      )}
    </>
  );
}

function FileCard({
  part,
}: {
  part: Extract<MessagePart, { type: "file" }>;
}) {
  return (
    <a
      href={part.url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-1 flex max-w-64 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 hover:bg-surface-2"
    >
      <span aria-hidden className="text-lg">📄</span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-text">{part.name}</span>
        <span className="block text-xs text-text-3">
          {formatBytes(part.size)}
        </span>
      </span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// 操作条小部件
// ---------------------------------------------------------------------------

function ActionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-surface-2 hover:text-text",
        active ? "text-primary" : "text-text-3",
      )}
    >
      {label}
    </button>
  );
}

function BranchSwitch({
  messageId,
  siblings,
  conversationId,
}: {
  messageId: string;
  siblings: Message[];
  conversationId: string;
}) {
  const switchBranch = useChatStore((s) => s.switchBranch);
  if (siblings.length <= 1) return null;
  const index = siblings.findIndex((m) => m.id === messageId);
  const btn =
    "rounded px-1 text-xs text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-30";
  return (
    <span className="flex items-center gap-0.5 text-xs text-text-3">
      <button
        type="button"
        className={btn}
        disabled={index <= 0}
        onClick={() => void switchBranch(conversationId, messageId, "prev")}
        aria-label="上一个分支"
      >
        ‹
      </button>
      {index + 1}/{siblings.length}
      <button
        type="button"
        className={btn}
        disabled={index >= siblings.length - 1}
        onClick={() => void switchBranch(conversationId, messageId, "next")}
        aria-label="下一个分支"
      >
        ›
      </button>
    </span>
  );
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("已复制");
  } catch {
    toast.error("复制失败");
  }
}

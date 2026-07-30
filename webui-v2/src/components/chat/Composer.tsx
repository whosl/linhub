// 聊天输入区:自适应高度 textarea + 模型/风格/思考强度/工具面板
// 状态持久化在 ui-store;模型选择 per conversation 优先(由调用方传 conversationModelId)

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStyles } from "@/api/chat-options";
import type { ThinkingEffort } from "@/api/chat";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/ui-store";
import type { SendPayload } from "@/stores/chat-store";
import { ModelMenu, useModels } from "./ModelMenu";
import { ToolControlsDialog, toolToggleSummary } from "./ToolControlsDialog";
import { useAttachments, type PendingAttachment } from "./use-attachments";
import { VoiceRecorderButton } from "./VoiceRecorderButton";
import { Spinner } from "@/components/ui/Spinner";

const ATTACH_ACCEPT =
  "image/*,.pdf,.txt,.md,.docx,.xlsx,.pptx,.csv,.zip";

const THINKING_EFFORTS: Array<{ value: ThinkingEffort; label: string }> = [
  { value: "minimal", label: "极简" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "超高" },
  { value: "max", label: "最大" },
];

export interface ComposerProps {
  streaming: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** 初始文本(建议卡填入;配合 key 重挂载生效) */
  initialText?: string;
  /** 会话已选模型(per conversation 优先于全局选择) */
  conversationModelId?: string;
  projectId?: string;
  skillId?: string;
  /** 引用文本(受控);有值时输入框上方显示引用条 */
  quote?: string | null;
  onClearQuote?: () => void;
  onSend: (payload: SendPayload) => void | Promise<void>;
  onStop?: () => void;
}

export function Composer({
  streaming,
  disabled,
  autoFocus,
  initialText,
  conversationModelId,
  projectId,
  skillId,
  quote,
  onClearQuote,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState(initialText ?? "");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const att = useAttachments(projectId);

  const selectedModelId = useUiStore((s) => s.selectedModelId);
  const setSelectedModelId = useUiStore((s) => s.setSelectedModelId);
  const styleId = useUiStore((s) => s.defaultReplyStyleId);
  const setStyleId = useUiStore((s) => s.setDefaultReplyStyleId);
  const extendedThinking = useUiStore((s) => s.extendedThinking);
  const setExtendedThinking = useUiStore((s) => s.setExtendedThinking);
  const modelThinkingEfforts = useUiStore((s) => s.modelThinkingEfforts);
  const setModelThinkingEffort = useUiStore((s) => s.setModelThinkingEffort);
  const tools = useUiStore((s) => s.chatTools);

  const { models, defaultModelId, find } = useModels();
  const effectiveModelId =
    conversationModelId ?? selectedModelId ?? defaultModelId ?? models[0]?.id;
  const currentModel = find(effectiveModelId);
  const supportsReasoning =
    currentModel?.capabilities.includes("reasoning") ?? false;
  const thinkingEffort: ThinkingEffort =
    (effectiveModelId && modelThinkingEfforts[effectiveModelId]) || "medium";

  const { data: styles } = useQuery({
    queryKey: ["styles"],
    queryFn: getStyles,
    staleTime: 5 * 60_000,
  });
  const effectiveStyleId =
    styleId ?? styles?.find((s) => s.builtIn)?.id ?? styles?.[0]?.id;

  // textarea 自适应高度(1~8 行)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 24;
    const max = lineHeight * 8;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [text]);

  const canSend =
    text.trim().length > 0 && !streaming && !disabled && !att.uploading;

  const submit = () => {
    if (!canSend) return;
    const { images, attachments } = att.toPayload();
    const payload: SendPayload = {
      text: text.trim(),
      modelId: effectiveModelId,
      styleId: effectiveStyleId,
      extendedThinking,
      thinkingEffort: supportsReasoning ? thinkingEffort : undefined,
      tools,
      quotedText: quote ?? undefined,
      projectId,
      skillId,
      images,
      attachments,
    };
    setText("");
    att.clear();
    onClearQuote?.();
    void onSend(payload);
  };

  const toolSummary = toolToggleSummary(tools);

  return (
    <div
      className={cn(
        "w-full rounded-3xl border bg-surface shadow-sm transition-colors",
        dragOver ? "border-dashed border-primary" : "border-border",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled || streaming) return;
        att.add(e.dataTransfer.files);
      }}
    >
      {/* 引用条 */}
      {quote && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
          <span className="mt-0.5 h-4 w-0.5 shrink-0 rounded bg-primary" aria-hidden />
          <p className="line-clamp-2 min-w-0 flex-1 text-xs text-text-2">
            {quote}
          </p>
          <button
            type="button"
            onClick={onClearQuote}
            aria-label="移除引用"
            className="shrink-0 text-text-3 hover:text-text"
          >
            ✕
          </button>
        </div>
      )}

      {/* 待发送附件条 */}
      {att.items.length > 0 && (
        <div className="mx-3 mt-3 flex gap-2 overflow-x-auto pb-1">
          {att.items.map((item) => (
            <AttachmentChip
              key={item.key}
              item={item}
              onRetry={() => att.retry(item.key)}
              onRemove={() => att.remove(item.key)}
            />
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ATTACH_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) att.add(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="px-4 pt-3">
        <textarea
          ref={textareaRef}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- 聊天主输入框,产品需要
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="输入消息,Enter 发送,Shift+Enter 换行"
          className="max-h-48 w-full resize-none bg-transparent text-[15px] leading-6 text-text outline-none placeholder:text-text-3"
        />
      </div>

      {/* 工具行 */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-2.5 pb-2.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="添加附件(图片 / 文档,单个 ≤ 20MB)"
          aria-label="添加附件"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-2 transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          <span aria-hidden>📎</span>
        </button>

        <VoiceRecorderButton
          disabled={disabled || streaming}
          onTranscribed={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))}
        />

        <ModelMenu value={effectiveModelId} onChange={setSelectedModelId} />

        {styles && styles.length > 0 && (
          <select
            value={effectiveStyleId ?? ""}
            onChange={(e) => setStyleId(e.target.value || undefined)}
            title="回复风格"
            className="h-7 max-w-28 cursor-pointer rounded-lg border-none bg-transparent px-1.5 text-xs text-text-2 hover:bg-surface-2"
          >
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {supportsReasoning && effectiveModelId && (
          <>
            <select
              value={thinkingEffort}
              onChange={(e) =>
                setModelThinkingEffort(
                  effectiveModelId,
                  e.target.value as ThinkingEffort,
                )
              }
              title="思考强度"
              className="h-7 cursor-pointer rounded-lg border-none bg-transparent px-1.5 text-xs text-text-2 hover:bg-surface-2"
            >
              {THINKING_EFFORTS.map((t) => (
                <option key={t.value} value={t.value}>
                  思考·{t.label}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-text-2 hover:bg-surface-2">
              <input
                type="checkbox"
                checked={extendedThinking}
                onChange={(e) => setExtendedThinking(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              深度思考
            </label>
          </>
        )}

        <button
          type="button"
          onClick={() => setToolsOpen(true)}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-surface-2",
            toolSummary ? "text-primary" : "text-text-2",
          )}
        >
          <span aria-hidden>🔧</span>
          {toolSummary || "工具"}
        </button>

        <div className="ml-auto">
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="停止生成"
              className="flex size-8 items-center justify-center rounded-full bg-text text-bg transition-opacity hover:opacity-80"
            >
              <span className="block size-3 rounded-[3px] bg-bg" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="发送"
              className="flex size-8 items-center justify-center rounded-full bg-primary text-sm text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              ↑
            </button>
          )}
        </div>
      </div>

      <ToolControlsDialog open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 待发送附件条目
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentChip({
  item,
  onRetry,
  onRemove,
}: {
  item: PendingAttachment;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const isImage = !!item.previewUrl;
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center gap-2 overflow-hidden rounded-xl border bg-surface-2",
        item.status === "error" ? "border-danger/50" : "border-border",
        isImage ? "p-1" : "max-w-48 px-2.5 py-1.5",
      )}
    >
      {isImage ? (
        <img
          src={item.previewUrl}
          alt={item.file.name}
          className="size-14 rounded-lg object-cover"
        />
      ) : (
        <>
          <span aria-hidden className="text-base">📄</span>
          <span className="min-w-0">
            <span className="block truncate text-xs text-text">{item.file.name}</span>
            <span className="block text-[10px] text-text-3">
              {formatBytes(item.file.size)}
            </span>
          </span>
        </>
      )}

      {/* 状态覆盖层 */}
      {item.status === "uploading" && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Spinner className="size-4 text-white" />
        </span>
      )}
      {item.status === "error" && (
        <button
          type="button"
          onClick={onRetry}
          title="上传失败,点击重试"
          className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white"
        >
          重试
        </button>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="移除附件"
        className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-black/50 text-[10px] text-white hover:bg-black/70"
      >
        ✕
      </button>
    </div>
  );
}

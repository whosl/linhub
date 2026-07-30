// 聊天页:/ 空态(问候 + 建议卡 + 居中 Composer)与 /chat/:id 会话视图

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listConversations } from "@/api/conversations";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { MessageItem } from "@/components/chat/MessageItem";
import { MessageRail } from "@/components/chat/MessageRail";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { useArtifactPanelStore } from "@/stores/artifact-panel-store";
import { useAuthStore } from "@/stores/auth-store";
import { visibleThread } from "@/stores/chat-core";
import { useChatStore } from "@/stores/chat-store";

const SUGGESTIONS: Array<{ title: string; prompt: string }> = [
  { title: "解释一个概念", prompt: "用通俗的语言解释一下什么是向量数据库,并举几个实际应用场景。" },
  { title: "写一段代码", prompt: "用 Python 写一个带重试和超时的 HTTP 请求工具函数,并解释关键设计。" },
  { title: "润色一段文字", prompt: "帮我把这段话润色得更专业、简洁:" },
  { title: "制定学习计划", prompt: "我想在一个月内入门大模型应用开发,帮我制定一份循序渐进的每周学习计划。" },
];

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // 新会话首帧(conversation-created)后跳转到真实会话地址
  const pendingRedirect = useChatStore((s) => s.pendingRedirect);
  useEffect(() => {
    if (pendingRedirect) {
      useChatStore.getState().consumePendingRedirect();
      navigate(`/chat/${pendingRedirect}`, { replace: true });
    }
  }, [pendingRedirect, navigate]);

  if (!id) return <NewChatView />;
  return <ConversationView key={id} conversationId={id} />;
}

// ---------------------------------------------------------------------------
// 空态:新对话
// ---------------------------------------------------------------------------

function NewChatView() {
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();
  const [sending, setSending] = useState(false);
  /** 建议卡点击后作为 Composer 初始文本(key 变化触发重挂载) */
  const [prefill, setPrefill] = useState<{ key: number; text: string } | null>(null);

  // ?skill= / ?project= 暂只透传到发送参数
  const skillId = searchParams.get("skill") ?? undefined;
  const projectId = searchParams.get("project") ?? undefined;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-8 px-4">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-text">
        {user?.name ? `你好,${user.name}` : "你好"}
      </h1>
      <p className="-mt-5 text-sm text-text-3">有什么可以帮你?</p>
      <div className="w-full">
        <Composer
          key={prefill?.key ?? 0}
          initialText={prefill?.text}
          streaming={false}
          disabled={sending}
          skillId={skillId}
          projectId={projectId}
          onSend={async (payload) => {
            setSending(true);
            try {
              await useChatStore.getState().send(null, payload);
            } finally {
              setSending(false);
            }
          }}
          autoFocus
        />
      </div>
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
        {SUGGESTIONS.map((s) => (
          <SuggestionCard
            key={s.title}
            title={s.title}
            onClick={() => setPrefill({ key: Date.now(), text: s.prompt })}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-left text-sm text-text-2 transition-colors hover:border-primary/40 hover:bg-surface-2 hover:text-text"
    >
      {title}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 已有会话
// ---------------------------------------------------------------------------

const NEAR_BOTTOM_PX = 120;

function ConversationView({ conversationId }: { conversationId: string }) {
  const session = useChatStore((s) => s.sessions[conversationId]);
  const failedInput = useChatStore((s) => s.failedSendInputs[conversationId]);
  const artifactPanelOpen = useArtifactPanelStore((s) => s.selectedId !== null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 用户是否停留在底部附近(ref 供 effect 同步读取) */
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  /** 引用回复:点消息「引用」后填入 Composer,发送后清空 */
  const [quote, setQuote] = useState<string | null>(null);

  useEffect(() => {
    void useChatStore.getState().ensureSession(conversationId);
  }, [conversationId]);

  // 会话元数据(模型名等)复用列表缓存
  const { data: conversation } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => listConversations(),
    select: (list) => list.find((c) => c.id === conversationId),
  });

  const messages = session?.messages;
  const leafId = session?.currentLeafId;
  const thread = useMemo(
    () => (messages ? visibleThread(messages, leafId) : []),
    [messages, leafId],
  );

  // 消息 / 流式文本变化:在底部附近则跟随滚动,否则提示有新内容
  const lastMsg = thread[thread.length - 1];
  const lastPartsLen = lastMsg?.parts.length;
  const lastTextLen = lastMsg
    ? lastMsg.parts.reduce(
        (n, p) => n + (p.type === "text" || p.type === "reasoning" ? p.text.length : 0),
        0,
      )
    : 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setHasNewBelow(true);
    }
  }, [thread.length, lastPartsLen, lastTextLen]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setShowJump(!near);
    if (near) setHasNewBelow(false);
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    nearBottomRef.current = true;
    setShowJump(false);
    setHasNewBelow(false);
  };

  if (!session || (!session.loaded && !session.loadError)) {
    return (
      <div className="flex h-full items-center justify-center text-text-2">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (session.loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-text-2">加载失败:{session.loadError}</p>
        <button
          type="button"
          onClick={() => void useChatStore.getState().ensureSession(conversationId)}
          className="rounded-lg border border-border px-4 py-1.5 text-sm text-text hover:bg-surface-2"
        >
          重试
        </button>
      </div>
    );
  }

  const streaming = session.status === "streaming";

  return (
    <div className="flex h-full flex-col">
      <ChatHeader conversationId={conversationId} />
      <div className="flex min-h-0 flex-1">
        {/* 消息区:面板打开时 lg 下缩到约 46% */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            artifactPanelOpen && "lg:flex-none lg:basis-[46%]",
          )}
        >
          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="h-full overflow-y-auto"
            >
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
                {thread.map((m) => (
                  <MessageItem
                    key={m.id}
                    message={m}
                    session={session}
                    isStreamingThis={
                      m.id === session.streamingMessageId && m.status === "streaming"
                    }
                    onQuote={setQuote}
                  />
                ))}
                {thread.length === 0 && (
                  <p className="py-16 text-center text-sm text-text-3">暂无消息</p>
                )}
              </div>
            </div>

            <MessageRail
              messageIds={thread.map((m) => m.id)}
              containerRef={scrollRef}
            />

            {showJump && (
              <button
                type="button"
                onClick={jumpToBottom}
                className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-text-2 shadow-md transition-colors hover:bg-surface-2"
              >
                {hasNewBelow && (
                  <span className="inline-block size-1.5 rounded-full bg-primary" />
                )}
                回到底部 ↓
              </button>
            )}
          </div>

          {failedInput && (
            <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              <span className="min-w-0 flex-1 truncate">
                发送失败:{failedInput.text}
              </span>
              <button
                type="button"
                onClick={() => void useChatStore.getState().retrySend(conversationId)}
                className="shrink-0 rounded-md border border-danger/40 px-2.5 py-1 text-xs hover:bg-danger/10"
              >
                重试
              </button>
            </div>
          )}

          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Composer
              streaming={streaming}
              conversationModelId={conversation?.modelId}
              quote={quote}
              onClearQuote={() => setQuote(null)}
              onSend={(payload) =>
                useChatStore.getState().send(conversationId, payload)
              }
              onStop={() => void useChatStore.getState().stop(conversationId)}
              autoFocus
            />
          </div>
        </div>

        {/* 右侧 Artifact 面板(桌面分栏 / 移动全屏,内部自处理) */}
        <ArtifactPanel conversationId={conversationId} />
      </div>
    </div>
  );
}

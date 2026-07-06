"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon } from "lucide-react";
import { getDataService } from "@/lib/data";
import { suggestedPrompts } from "@/lib/data/mock/fixtures";
import type { FilePart, ImagePart } from "@/lib/types";
import {
  deepestLeaf,
  useChatStore,
  visibleThread,
} from "@/stores/chat-store";
import { ChatInput, type ComposerState } from "./chat-input";
import { MessageItem, type BranchInfo } from "./message-item";
import { ArtifactPanel } from "@/components/artifacts/artifact-panel";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DEFAULT_COMPOSER: ComposerState = {
  modelId: "",
  styleId: "style-normal",
  extendedThinking: true,
  tools: {
    webSearch: true,
    imageGeneration: true,
    codeRunner: true,
    mcpServerIds: [],
    knowledgeBaseIds: [],
  },
};

export function ChatView({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [composer, setComposer] = React.useState<ComposerState>(DEFAULT_COMPOSER);
  const [quotedText, setQuotedText] = React.useState<string | undefined>();

  // C3: 从 URL 读取技能/项目预选，发首条消息时带上，之后清除 query。
  // 用 state 暂存是为了避免每次 send 重复读，且发送后立即从 URL 抹掉。
  const searchParams = useSearchParams();
  const [pendingContext] = React.useState(() => ({
    skillId: searchParams.get("skill") ?? undefined,
    projectId: searchParams.get("project") ?? undefined,
  }));
  React.useEffect(() => {
    if (pendingContext.skillId || pendingContext.projectId) {
      router.replace("/");
    }
  }, [pendingContext.skillId, pendingContext.projectId, router]);

  const { data: modelsData } = useQuery({
    queryKey: ["models", "with-default"],
    queryFn: () => getDataService().listModelsWithDefault(),
  });
  const models = modelsData?.models ?? [];
  const defaultModelId = modelsData?.defaultModelId;
  const firstChatModelId = models.find(
    (m) => !m.capabilities.includes("image-generation")
  )?.id;
  const { data: currentConversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => getDataService().getConversation(conversationId!),
    enabled: !!conversationId,
  });
  const { data: styles = [] } = useQuery({
    queryKey: ["styles"],
    queryFn: () => getDataService().listStyles(),
  });
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getDataService().getCurrentUser(),
  });
  const { data: artifacts = [] } = useQuery({
    queryKey: ["artifacts", conversationId],
    queryFn: () => getDataService().listArtifacts(conversationId!),
    enabled: !!conversationId,
  });
  const [openArtifactId, setOpenArtifactId] = React.useState<string | null>(null);
  const openArtifact = artifacts.find((a) => a.id === openArtifactId) ?? null;
  const openArtifactById = React.useCallback(
    (id: string) => {
      setOpenArtifactId(id);
      if (conversationId && !artifacts.some((a) => a.id === id)) {
        void queryClient.invalidateQueries({ queryKey: ["artifacts", conversationId] });
      }
    },
    [artifacts, conversationId, queryClient, setOpenArtifactId]
  );

  const session = useChatStore((s) =>
    conversationId ? s.sessions[conversationId] : undefined
  );
  const artifactPartsKey = (session?.messages ?? [])
    .flatMap((m) =>
      m.parts.flatMap((p) => {
        if (
          p.type !== "tool-call" ||
          (p.toolName !== "create_artifact" && p.toolName !== "update_artifact") ||
          p.state !== "success" ||
          !p.result?.artifactId
        ) {
          return [];
        }
        return [`${p.toolCallId}:${p.result.artifactId}`];
      })
    )
    .join("|");
  const pendingRedirect = useChatStore((s) => s.pendingRedirect);
  // I11: 新会话首条响应进行中标记，用于显示停止按钮
  const isStartingNew = useChatStore((s) => s.isStartingNew);
  const { ensureSession, send, stop, regenerate, switchBranch, setFeedback, clearRedirect, replaceMessageImage } =
    useChatStore();

  // 加载会话
  React.useEffect(() => {
    if (conversationId) void ensureSession(conversationId);
  }, [conversationId, ensureSession]);

  React.useEffect(() => {
    if (!conversationId || !artifactPartsKey) return;
    void queryClient.invalidateQueries({ queryKey: ["artifacts", conversationId] });
  }, [artifactPartsKey, conversationId, queryClient]);

  // 默认模型：后端返回的 defaultModelId 到达后，初始化 composer（仅首次，不覆盖用户已选）
  React.useEffect(() => {
    if (defaultModelId && composer.modelId === "") {
      // 用 microtask 异步 setState，符合 react-hooks/set-state-in-effect 规则
      Promise.resolve().then(() => {
        setComposer((prev) => (prev.modelId === "" ? { ...prev, modelId: defaultModelId! } : prev));
      });
    }
  }, [defaultModelId, composer.modelId]);

  // 会话模型跟随会话设置。直达 /chat/:id 时侧栏缓存可能还没加载，
  // 因此这里用独立 query 确保 composer 一定恢复到该会话的模型。
  React.useEffect(() => {
    if (!currentConversation) return;
    Promise.resolve().then(() => {
      setComposer((prev) => ({ ...prev, modelId: currentConversation.modelId }));
    });
  }, [currentConversation]);

  // 新会话创建后跳转
  React.useEffect(() => {
    if (pendingRedirect && !conversationId) {
      const id = pendingRedirect;
      clearRedirect();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.replace(`/chat/${id}`);
    }
  }, [pendingRedirect, conversationId, router, clearRedirect, queryClient]);

  const messages = React.useMemo(
    () => (session ? visibleThread(session.messages, session.currentLeafId) : []),
    [session]
  );
  const isStreaming = session?.status === "streaming";

  // ---- 滚动锁定 ----
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const atBottomRef = React.useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottomRef.current = isBottom;
    setAtBottom(isBottom);
  };

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  // 把指定模型设为用户默认（PATCH /api/me），并刷新用户缓存
  const setDefaultModel = async (mid: string) => {
    try {
      await getDataService().updateProfile({ defaultModelId: mid });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      queryClient.invalidateQueries({ queryKey: ["models"] });
      queryClient.invalidateQueries({ queryKey: ["models", "with-default"] });
      toast.success("已设为默认模型");
    } catch {
      toast.error("设置失败");
    }
  };

  // ---- 发送 ----
  const handleSend = (text: string, images: ImagePart[], files: FilePart[]) => {
    void send({
      conversationId,
      text,
      images,
      attachments: files,
      quotedText,
      modelId: composer.modelId || defaultModelId || firstChatModelId || "",
      styleId: composer.styleId,
      extendedThinking: composer.extendedThinking,
      tools: composer.tools,
      // C3: 仅新对话首条消息携带技能/项目预选
      ...(conversationId ? {} : pendingContext),
    });
    setQuotedText(undefined);
    if (conversationId) {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  };

  const handleEditResend = (parentId: string | null) => (newText: string) => {
    if (!conversationId) return;
    void send({
      conversationId,
      parentId,
      text: newText,
      modelId: composer.modelId || defaultModelId || firstChatModelId || "",
      styleId: composer.styleId,
      extendedThinking: composer.extendedThinking,
      tools: composer.tools,
    });
  };

  // ---- 分支信息 ----
  const branchInfo = (messageId: string, parentId: string | null): BranchInfo | undefined => {
    if (!session) return undefined;
    const siblings = session.messages.filter((m) => m.parentId === parentId);
    if (siblings.length <= 1) return undefined;
    const index = siblings.findIndex((m) => m.id === messageId);
    return {
      index,
      total: siblings.length,
      onPrev: () => {
        const target = siblings[index - 1];
        if (target && conversationId)
          switchBranch(conversationId, deepestLeaf(session.messages, target.id));
      },
      onNext: () => {
        const target = siblings[index + 1];
        if (target && conversationId)
          switchBranch(conversationId, deepestLeaf(session.messages, target.id));
      },
    };
  };

  // ---- 空状态（新对话） ----
  if (!conversationId) {
    const hour = new Date().getHours();
    const greeting =
      hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-3xl"
          >
            <h1 className="mb-8 text-center font-serif text-3xl text-foreground/90">
              {greeting}，{user?.name ?? "朋友"}
            </h1>
            <ChatInput
              models={models}
              styles={styles}
              composer={composer}
              onComposerChange={(p) => setComposer((prev) => ({ ...prev, ...p }))}
              isStreaming={isStartingNew}
              onSend={handleSend}
              // I11: 新会话首条响应期间也能停止（store/api-service 用哨兵键登记 controller）
              onStop={() => void stop()}
              defaultModelId={user?.defaultModelId ?? defaultModelId}
              onSetDefaultModel={setDefaultModel}
              autoFocus
            />
            <div className="mx-auto mt-2 grid max-w-2xl grid-cols-2 gap-2 px-4 sm:grid-cols-3">
              {suggestedPrompts.map((s, i) => (
                <motion.button
                  key={s.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.05, duration: 0.3 }}
                  onClick={() => handleSend(s.prompt, [], [])}
                  className="rounded-xl border bg-card px-3 py-2.5 text-left text-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                >
                  <span className="mr-1.5">{s.icon}</span>
                  <span className="font-medium">{s.title}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ---- 会话视图（含 Artifacts 分栏） ----
  return (
    <div className="flex h-full min-h-0">
      <div
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-1 flex-col",
          openArtifact && "hidden lg:flex lg:max-w-[46%]"
        )}
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-6 pt-14">
            {/* I17: 会话不存在或为空时显示占位，而非空白 */}
            {session?.loaded && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                <p className="text-sm text-muted-foreground">
                  会话不存在或已被删除。
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  返回新对话
                </button>
              </div>
            )}
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                isStreaming={isStreaming && session?.streamingMessageId === m.id}
                models={models}
                branch={branchInfo(m.id, m.parentId)}
                onRegenerate={
                  m.role === "assistant"
                    ? (modelId) => void regenerate(conversationId, m.id, modelId)
                    : undefined
                }
                onEditResend={
                  m.role === "user" ? handleEditResend(m.parentId) : undefined
                }
                onFeedback={
                  m.role === "assistant"
                    ? (fb) => void setFeedback(conversationId, m.id, fb)
                    : undefined
                }
                onQuote={(text) => setQuotedText(text)}
                onOpenArtifact={openArtifactById}
                onImageEdited={
                  conversationId
                    ? (oldUrl, newUrl) =>
                        void replaceMessageImage(conversationId, m.id, oldUrl, newUrl)
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        {/* 回到底部 */}
        <div className="relative">
          <motion.button
            initial={false}
            animate={{
              opacity: atBottom ? 0 : 1,
              y: atBottom ? 8 : 0,
              pointerEvents: atBottom ? "none" : "auto",
            }}
            onClick={scrollToBottom}
            className={cn(
              "absolute -top-12 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-card p-2 shadow-md transition-colors hover:bg-accent"
            )}
          >
            <ArrowDownIcon className="size-4" />
          </motion.button>
        </div>

        <ChatInput
          models={models}
          styles={styles}
          composer={composer}
          onComposerChange={(p) => setComposer((prev) => ({ ...prev, ...p }))}
          quotedText={quotedText}
          onClearQuote={() => setQuotedText(undefined)}
          isStreaming={!!isStreaming}
          onSend={handleSend}
          onStop={() => void stop(conversationId)}
          defaultModelId={user?.defaultModelId ?? defaultModelId}
          onSetDefaultModel={setDefaultModel}
        />
      </div>

      <AnimatePresence>
        {openArtifact && (
          <ArtifactPanel
            key={openArtifact.id}
            artifact={openArtifact}
            onClose={() => setOpenArtifactId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon } from "lucide-react";
import { getDataService } from "@/lib/data";
import { suggestedPrompts } from "@/lib/data/mock/fixtures";
import type { FilePart, ImagePart, Model } from "@/lib/types";
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
const EMPTY_MODELS: Model[] = [];

export function ChatView({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [composer, setComposer] = React.useState<ComposerState>(DEFAULT_COMPOSER);
  const [quotedText, setQuotedText] = React.useState<string | undefined>();
  const modelExplicitlySelectedRef = React.useRef(false);

  // C3: 从 URL 读取技能/项目预选，发首条消息时带上。
  // 不要提前清理 query；App Router 可能因此重挂载页面，丢失 skill/project 上下文。
  const searchParams = useSearchParams();
  const pendingSkillId = searchParams.get("skill") ?? undefined;
  const pendingProjectId = searchParams.get("project") ?? undefined;
  const pendingContext = React.useMemo(
    () => ({
      skillId: pendingSkillId,
      projectId: pendingProjectId,
    }),
    [pendingProjectId, pendingSkillId]
  );

  const { data: modelsData } = useQuery({
    queryKey: ["models", "with-default"],
    queryFn: () => getDataService().listModelsWithDefault(),
  });
  const models = modelsData?.models ?? EMPTY_MODELS;
  const defaultModelId = modelsData?.defaultModelId;
  const firstChatModelId = models.find(
    (m) => !m.capabilities.includes("image-generation")
  )?.id;
  const chatModelIds = React.useMemo(
    () =>
      new Set(
        models
          .filter((m) => !m.capabilities.includes("image-generation"))
          .map((m) => m.id)
      ),
    [models]
  );
  const { data: currentConversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => getDataService().getConversation(conversationId!),
    enabled: !!conversationId,
  });
  const { data: pendingProject } = useQuery({
    queryKey: ["project", pendingContext.projectId],
    queryFn: () => getDataService().getProject(pendingContext.projectId!),
    enabled: !conversationId && !!pendingContext.projectId,
  });
  const { data: pendingSkill } = useQuery({
    queryKey: ["skill", pendingContext.skillId],
    queryFn: () => getDataService().getSkill(pendingContext.skillId!),
    enabled: !conversationId && !!pendingContext.skillId,
  });
  const { data: styles = [] } = useQuery({
    queryKey: ["styles"],
    queryFn: () => getDataService().listStyles(),
  });
  const { data: knowledgeBases = [], isSuccess: knowledgeBasesLoaded } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => getDataService().listKnowledgeBases(),
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
  const invalidateProjectQueries = React.useCallback(
    (projectId?: string | null) => {
      if (!projectId) return;
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["project-conversations", projectId] });
    },
    [queryClient]
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
  const startError = useChatStore((s) => s.startError);
  const { ensureSession, send, stop, regenerate, switchBranch, setFeedback, clearRedirect, replaceMessageImage } =
    useChatStore();

  React.useEffect(() => {
    modelExplicitlySelectedRef.current = false;
  }, [conversationId, pendingContext.projectId, pendingContext.skillId]);

  const handleComposerChange = React.useCallback((patch: Partial<ComposerState>) => {
    if ("modelId" in patch) modelExplicitlySelectedRef.current = true;
    setComposer((prev) => ({ ...prev, ...patch }));
  }, []);

  // 加载会话
  React.useEffect(() => {
    if (conversationId) void ensureSession(conversationId);
  }, [conversationId, ensureSession]);

  React.useEffect(() => {
    if (!conversationId || !artifactPartsKey) return;
    void queryClient.invalidateQueries({ queryKey: ["artifacts", conversationId] });
  }, [artifactPartsKey, conversationId, queryClient]);

  const automaticModelId = React.useMemo(() => {
    if (currentConversation) {
      return currentConversation.modelId || defaultModelId || firstChatModelId || "";
    }
    if (!conversationId) {
      if (
        pendingSkill?.defaultModelId &&
        chatModelIds.has(pendingSkill.defaultModelId)
      ) {
        return pendingSkill.defaultModelId;
      }
      if (pendingProject?.modelId && chatModelIds.has(pendingProject.modelId)) {
        return pendingProject.modelId;
      }
    }
    return defaultModelId || firstChatModelId || "";
  }, [
    chatModelIds,
    conversationId,
    currentConversation,
    defaultModelId,
    firstChatModelId,
    pendingProject?.modelId,
    pendingSkill?.defaultModelId,
  ]);

  // 会话/技能/项目/默认模型共同决定自动模型；用户手动切换后不再覆盖。
  React.useEffect(() => {
    if (modelExplicitlySelectedRef.current) return;
    Promise.resolve().then(() => {
      setComposer((prev) =>
        prev.modelId === automaticModelId
          ? prev
          : { ...prev, modelId: automaticModelId }
      );
    });
  }, [automaticModelId]);

  React.useEffect(() => {
    if (!knowledgeBasesLoaded) return;
    const availableIds = new Set(knowledgeBases.map((kb) => kb.id));
    Promise.resolve().then(() => {
      setComposer((prev) => {
        const nextIds = prev.tools.knowledgeBaseIds.filter((id) => availableIds.has(id));
        if (nextIds.length === prev.tools.knowledgeBaseIds.length) return prev;
        return { ...prev, tools: { ...prev.tools, knowledgeBaseIds: nextIds } };
      });
    });
  }, [knowledgeBases, knowledgeBasesLoaded]);

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
    const activeConversationId = conversationId;
    const activeProjectId = pendingContext.projectId ?? currentConversation?.projectId;
    const shouldUseServerContextDefault =
      !conversationId &&
      (!!pendingContext.projectId || !!pendingContext.skillId) &&
      !modelExplicitlySelectedRef.current;
    const selectedModelId =
      composer.modelId ||
      defaultModelId ||
      firstChatModelId ||
      "";
    void (async () => {
      try {
        await send({
          conversationId,
          text,
          images,
          attachments: files,
          quotedText,
          ...(shouldUseServerContextDefault ? {} : { modelId: selectedModelId }),
          styleId: composer.styleId,
          extendedThinking: composer.extendedThinking,
          tools: composer.tools,
          // C3: 仅新对话首条消息携带技能/项目预选
          ...(conversationId ? {} : pendingContext),
        });
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        if (activeConversationId) {
          void queryClient.invalidateQueries({
            queryKey: ["conversation", activeConversationId],
          });
        }
        invalidateProjectQueries(activeProjectId);
      }
    })();
    setQuotedText(undefined);
  };

  const handleEditResend = (parentId: string | null) => (newText: string) => {
    if (!conversationId) return;
    const activeConversationId = conversationId;
    const activeProjectId = currentConversation?.projectId;
    void (async () => {
      try {
        await send({
          conversationId,
          parentId,
          text: newText,
          modelId: composer.modelId || defaultModelId || firstChatModelId || "",
          styleId: composer.styleId,
          extendedThinking: composer.extendedThinking,
          tools: composer.tools,
        });
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId],
        });
        invalidateProjectQueries(activeProjectId);
      }
    })();
  };

  const handleRegenerate = (assistantMessageId: string, modelId?: string) => {
    if (!conversationId) return;
    const activeConversationId = conversationId;
    const activeProjectId = currentConversation?.projectId;
    void (async () => {
      try {
        await regenerate(activeConversationId, assistantMessageId, modelId);
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({
          queryKey: ["conversation", activeConversationId],
        });
        invalidateProjectQueries(activeProjectId);
      }
    })();
  };

  const handleStop = () => {
    const activeConversationId = conversationId;
    void (async () => {
      try {
        await stop(activeConversationId);
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        if (activeConversationId) {
          void queryClient.invalidateQueries({
            queryKey: ["conversation", activeConversationId],
          });
        }
      }
    })();
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
    const skillGreeting = pendingSkill?.greeting || pendingSkill?.description;

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
              {pendingSkill
                ? `${pendingSkill.emoji} ${pendingSkill.name}`
                : `${greeting}，${user?.name ?? "朋友"}`}
            </h1>
            {skillGreeting && (
              <p className="-mt-5 mb-6 text-center text-sm text-muted-foreground">
                {skillGreeting}
              </p>
            )}
            {pendingContext.skillId && pendingSkill === null && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                技能不可用，可能已被删除或没有访问权限。
              </div>
            )}
            {startError && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {startError}
              </div>
            )}
            <ChatInput
              models={models}
              styles={styles}
              knowledgeBases={knowledgeBases}
              composer={composer}
              onComposerChange={handleComposerChange}
              isStreaming={isStartingNew}
              onSend={handleSend}
              // I11: 新会话首条响应期间也能停止（store/api-service 用哨兵键登记 controller）
              onStop={handleStop}
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
            {session?.loadError && (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                <p className="text-sm text-muted-foreground">
                  会话加载失败，请检查服务器连接后重试。
                </p>
                <button
                  onClick={() => void ensureSession(conversationId)}
                  className="rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  重试
                </button>
              </div>
            )}
            {session?.streamError && !session.loadError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {session.streamError}
              </div>
            )}
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
                branch={isStreaming ? undefined : branchInfo(m.id, m.parentId)}
                onRegenerate={
                  m.role === "assistant" && !isStreaming
                    ? (modelId) => handleRegenerate(m.id, modelId)
                    : undefined
                }
                onEditResend={
                  m.role === "user" && !isStreaming
                    ? handleEditResend(m.parentId)
                    : undefined
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
            type="button"
            aria-label="回到底部"
            aria-hidden={atBottom}
            tabIndex={atBottom ? -1 : 0}
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
          knowledgeBases={knowledgeBases}
          composer={composer}
          onComposerChange={handleComposerChange}
          quotedText={quotedText}
          onClearQuote={() => setQuotedText(undefined)}
          isStreaming={!!isStreaming}
          onSend={handleSend}
          onStop={handleStop}
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

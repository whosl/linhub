"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon } from "lucide-react";
import { getDataService } from "@/lib/data";
import { clientRandomUUID } from "@/lib/client-id";
import { suggestedPrompts } from "@/lib/data/mock/fixtures";
import type {
  FilePart,
  ImagePart,
  Message,
  MediaAsset,
  Model,
  Project,
  Skill,
  User,
} from "@/lib/types";
import { optimisticPatchRecords } from "@/lib/optimistic-query";
import {
  deepestLeaf,
  isSkillRunReceiptMessage,
  useChatStore,
  visibleThread,
} from "@/stores/chat-store";
import { ChatHeader } from "./chat-header";
import { ChatInput, type ComposerState } from "./chat-input";
import { MessageItem, type BranchInfo } from "./message-item";
import { ArtifactPanel } from "@/components/artifacts/artifact-panel";
import { MediaPreviewPanel } from "@/components/artifacts/media-preview-panel";
import type { SkillRunAttachment } from "./skill-run-card";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { sanitizeAssistantText, sanitizeReasoningText } from "@/lib/chat-text";
import { useUiStore } from "@/stores/ui-store";
import { toast } from "sonner";
import {
  modelSupportsThinking,
  resolveModelThinkingEffort,
} from "@/lib/model-thinking";

const DEFAULT_COMPOSER: ComposerState = {
  modelId: "",
  styleId: "style-normal",
  extendedThinking: true,
  thinkingEffort: "high",
  tools: {
    autoRouting: false,
    webSearch: true,
    imageGeneration: true,
    codeRunner: true,
    knowledgeSearch: true,
    mcpServerIds: [],
    knowledgeBaseIds: [],
  },
};
const EMPTY_MODELS: Model[] = [];

const PROJECT_SUGGESTED_PROMPTS = [
  {
    icon: "📋",
    title: "总结项目资料",
    prompt: "请总结本项目已有资料和关联知识库的要点，并列出我可以继续推进的方向。",
  },
  {
    icon: "🧭",
    title: "按指令规划下一步",
    prompt: "请根据本项目的项目指令，帮我规划接下来最值得做的几步，并说明理由。",
  },
  {
    icon: "📚",
    title: "基于知识库提问",
    prompt: "请基于本项目关联的知识库回答：",
  },
  {
    icon: "📁",
    title: "概述项目文件",
    prompt: "请列出并概述本项目中的文件内容，标出各自用途。",
    requiresFiles: true,
  },
] as const;

function truncateText(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

function messageAnchorId(messageId: string) {
  return `chat-message-${messageId}`;
}

function buildMessagePreview(
  message: Message,
  {
    includeReasoning = true,
    includeToolCalls = true,
  }: { includeReasoning?: boolean; includeToolCalls?: boolean } = {}
) {
  const snippets: string[] = [];

  for (const part of message.parts) {
    switch (part.type) {
      case "text":
        snippets.push(sanitizeAssistantText(part.text));
        break;
      case "reasoning":
        if (includeReasoning) {
          const reasoningText = sanitizeReasoningText(part.text);
          if (reasoningText) snippets.push(`思考：${reasoningText}`);
        }
        break;
      case "image":
        snippets.push(part.alt ? `图片：${part.alt}` : "图片");
        break;
      case "file":
        snippets.push(`文件：${part.name}`);
        break;
      case "tool-call":
        if (includeToolCalls) {
          snippets.push(`工具：${String(part.toolName).replace(/_/g, " ")}`);
        }
        break;
      default:
        break;
    }
  }

  const preview = snippets.join(" ").replace(/\s+/g, " ").trim();
  if (preview) return truncateText(preview, 88);
  return message.role === "assistant" ? "助手回复" : "用户消息";
}

function buildMessageRailItems(messages: Message[]) {
  return messages.flatMap((message, messageIndex) => {
    if (message.role !== "user") return [];

    const reply = messages
      .slice(messageIndex + 1)
      .find((candidate) => candidate.role === "assistant");

    return [
      {
        id: message.id,
        title: buildMessagePreview(message),
        preview: reply
          ? buildMessagePreview(reply, {
              includeReasoning: false,
              includeToolCalls: false,
            })
          : "",
      },
    ];
  });
}

const MESSAGE_RAIL_ITEM_GAP_PX = 14;
const MESSAGE_RAIL_MIN_ITEM_GAP_PX = 10;
const MESSAGE_RAIL_HITBOX_PX = 24;

function ChatMessageRail({
  messages,
  activeMessageId,
  onJump,
}: {
  messages: Message[];
  activeMessageId?: string | null;
  onJump: (messageId: string) => void;
}) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [railHeight, setRailHeight] = React.useState(0);
  const railRef = React.useRef<HTMLDivElement>(null);
  const items = React.useMemo(
    () => buildMessageRailItems(messages).map((item, index) => ({ ...item, index })),
    [messages]
  );

  React.useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    const updateHeight = () => setRailHeight(el.getBoundingClientRect().height);
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  const itemGap = React.useMemo(() => {
    if (items.length <= 1 || railHeight <= 0) return MESSAGE_RAIL_ITEM_GAP_PX;
    const maxGap = (railHeight - MESSAGE_RAIL_HITBOX_PX) / (items.length - 1);
    return Math.max(
      MESSAGE_RAIL_MIN_ITEM_GAP_PX,
      Math.min(MESSAGE_RAIL_ITEM_GAP_PX, maxGap)
    );
  }, [items.length, railHeight]);

  const getOffset = React.useCallback(
    (index: number) => (index - (items.length - 1) / 2) * itemGap,
    [itemGap, items.length]
  );

  const hoveredItem = items.find((item) => item.id === hoveredId) ?? null;
  const dragStateRef = React.useRef<{ active: boolean; lastJumpedId: string | null }>({
    active: false,
    lastJumpedId: null,
  });
  const [isDraggingRail, setIsDraggingRail] = React.useState(false);

  const getNearestItemFromClientY = React.useCallback(
    (clientY: number, element: HTMLDivElement) => {
      if (items.length === 0) return null;
      const rect = element.getBoundingClientRect();
      const yFromCenter = clientY - rect.top - rect.height / 2;
      return items.reduce((best, item) => {
        const distance = Math.abs(getOffset(item.index) - yFromCenter);
        return distance < best.distance ? { item, distance } : best;
      }, { item: items[0], distance: Number.POSITIVE_INFINITY }).item;
    },
    [getOffset, items]
  );

  const previewFromClientY = React.useCallback(
    (clientY: number, element: HTMLDivElement) => {
      const nearest = getNearestItemFromClientY(clientY, element);
      setHoveredId(nearest?.id ?? null);
      return nearest;
    },
    [getNearestItemFromClientY]
  );

  const jumpFromClientY = React.useCallback(
    (clientY: number, element: HTMLDivElement) => {
      const nearest = previewFromClientY(clientY, element);
      if (nearest && dragStateRef.current.lastJumpedId !== nearest.id) {
        dragStateRef.current.lastJumpedId = nearest.id;
        onJump(nearest.id);
      }
    },
    [onJump, previewFromClientY]
  );

  const handleMouseMove = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (dragStateRef.current.active) return;
      previewFromClientY(event.clientY, event.currentTarget);
    },
    [previewFromClientY]
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (items.length === 0) return;
      dragStateRef.current = { active: true, lastJumpedId: null };
      setIsDraggingRail(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      jumpFromClientY(event.clientY, event.currentTarget);
      event.preventDefault();
    },
    [items.length, jumpFromClientY]
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStateRef.current.active) return;
      jumpFromClientY(event.clientY, event.currentTarget);
      event.preventDefault();
    },
    [jumpFromClientY]
  );

  const finishDrag = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    setIsDraggingRail(false);
    if (event.pointerType !== "mouse") {
      setHoveredId(null);
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针可能已经被浏览器释放。
    }
    event.preventDefault();
  }, []);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="消息导航"
      className="pointer-events-none absolute bottom-1/3 right-2 top-1/3 z-30 flex w-[14px] sm:right-4 sm:w-[clamp(2rem,8vw,4rem)]"
    >
      <div
        ref={railRef}
        className={cn(
          "pointer-events-auto relative h-full w-[14px] touch-none select-none sm:w-[clamp(2rem,8vw,4rem)]",
          isDraggingRail && "cursor-grabbing"
        )}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          if (!dragStateRef.current.active) setHoveredId(null);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClick={() => {
          if (hoveredId) onJump(hoveredId);
          setHoveredId(null);
        }}
      >
        {items.map((item) => {
          const isActive = activeMessageId === item.id;
          const isHovered = hoveredId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`跳到用户消息：${item.title}`}
              onMouseEnter={() => setHoveredId(item.id)}
              onClick={(event) => {
                event.stopPropagation();
                onJump(item.id);
                setHoveredId(null);
              }}
              className={cn(
                "absolute right-0 flex h-6 w-[14px] -translate-y-1/2 items-center justify-end rounded-sm sm:w-[clamp(2rem,8vw,4rem)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              )}
              style={{ top: `calc(50% + ${getOffset(item.index)}px)` }}
            >
              <span
                className={cn(
                  "block h-1 rounded-sm bg-muted-foreground/25 transition-all",
                  isActive && "w-[clamp(0.5rem,2.5vw,1.75rem)] bg-foreground",
                  !isActive &&
                    isHovered &&
                    "w-[clamp(0.875rem,3vw,2.25rem)] bg-muted-foreground/60",
                  !isActive && !isHovered && "w-[clamp(0.5rem,1.6vw,0.75rem)]"
                )}
              />
            </button>
          );
        })}
        {hoveredItem && (
          <div
            className="pointer-events-none absolute w-[min(640px,calc(100vw-4rem))] rounded-2xl border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur"
            style={{
              top: `calc(50% + ${getOffset(hoveredItem.index)}px)`,
              right: "calc(clamp(2rem, 8vw, 4rem) + 0.5rem)",
              transform: "translateY(-50%)",
            }}
          >
            <p className="line-clamp-1 text-base font-medium leading-6 text-foreground">
              {hoveredItem.title}
            </p>
            {hoveredItem.preview && (
              <p className="mt-2 line-clamp-3 text-[15px] leading-7 text-muted-foreground">
                {hoveredItem.preview}
              </p>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

function ProjectEmptyHeader({ project }: { project: Project }) {
  const fileCount = project.files.length;
  const kbCount = project.knowledgeBaseIds.length;
  const metaParts = [
    fileCount > 0 ? `${fileCount} 个项目资料` : null,
    kbCount > 0 ? `${kbCount} 个关联知识库` : null,
  ].filter(Boolean);

  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <span
        className="mb-3 flex size-12 items-center justify-center rounded-xl font-serif text-xl text-white"
        style={{ backgroundColor: project.color ?? "#C96442" }}
      >
        {project.name.slice(0, 1)}
      </span>
      <h1 className="font-serif text-3xl text-foreground/90">{project.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">将在此项目中创建对话</p>
      {project.description && (
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {truncateText(project.description, 120)}
        </p>
      )}
      {metaParts.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{metaParts.join(" · ")}</p>
      )}
      {project.instructions && (
        <p className="mt-3 max-w-xl rounded-xl border bg-muted/40 px-3 py-2 text-left text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">项目指令：</span>
          {truncateText(project.instructions, 100)}
        </p>
      )}
    </div>
  );
}

export function ChatView({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const messageRailEnabled = useUiStore((s) => s.messageRailEnabled);
  const defaultReplyStyleId = useUiStore((s) => s.defaultReplyStyleId);
  const modelThinkingEfforts = useUiStore((s) => s.modelThinkingEfforts);
  const setModelThinkingEffort = useUiStore((s) => s.setModelThinkingEffort);
  const resetModelThinkingEffort = useUiStore((s) => s.resetModelThinkingEffort);
  const [composer, setComposer] = React.useState<ComposerState>(DEFAULT_COMPOSER);
  const [quotedText, setQuotedText] = React.useState<string | undefined>();
  const [temporaryProjectChat, setTemporaryProjectChat] = React.useState(false);
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
  const showTemporaryProjectChat = temporaryProjectChat && !pendingProjectId;

  const { data: modelsData } = useQuery({
    queryKey: ["models", "with-default"],
    queryFn: () => getDataService().listModelsWithDefault(),
  });
  const models = modelsData?.models ?? EMPTY_MODELS;
  const defaultModelId = modelsData?.defaultModelId;
  const { data: currentConversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => getDataService().getConversation(conversationId!),
    enabled: !!conversationId,
  });
  const activeProjectId = pendingContext.projectId ?? currentConversation?.projectId;
  const {
    data: activeProject,
    isFetched: activeProjectFetched,
  } = useQuery({
    queryKey: ["project", activeProjectId],
    queryFn: () => getDataService().getProject(activeProjectId!),
    enabled: !!activeProjectId,
  });
  const { data: pendingSkill, isFetched: pendingSkillFetched } = useQuery({
    queryKey: ["skill", pendingContext.skillId],
    queryFn: () => getDataService().getSkill(pendingContext.skillId!),
    enabled: !conversationId && !!pendingContext.skillId,
  });
  const { data: currentSkill } = useQuery({
    queryKey: ["skill", currentConversation?.skillId],
    queryFn: () => getDataService().getSkill(currentConversation!.skillId!),
    enabled: !!conversationId && !!currentConversation?.skillId,
  });
  const activeSkill: Skill | undefined = pendingSkill ?? currentSkill ?? undefined;
  const { data: styles = [] } = useQuery({
    queryKey: ["styles"],
    queryFn: () => getDataService().listStyles(),
  });
  const effectiveDefaultStyleId = React.useMemo(() => {
    if (styles.some((style) => style.id === defaultReplyStyleId)) {
      return defaultReplyStyleId;
    }
    return styles.find((style) => style.id === "style-normal")?.id ?? styles[0]?.id ?? "style-normal";
  }, [defaultReplyStyleId, styles]);
  const { data: knowledgeBases = [], isSuccess: knowledgeBasesLoaded } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => getDataService().listKnowledgeBases(),
  });
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => getDataService().getCurrentUser(),
  });
  const defaultableChatModels = React.useMemo(
    () =>
      models.filter((m) => !m.capabilities.includes("image-generation")),
    [models]
  );
  const firstChatModelId = defaultableChatModels[0]?.id;
  const defaultableChatModelIds = React.useMemo(
    () => new Set(defaultableChatModels.map((m) => m.id)),
    [defaultableChatModels]
  );
  const { data: artifacts = [] } = useQuery({
    queryKey: ["artifacts", conversationId],
    queryFn: () => getDataService().listArtifacts(conversationId!),
    enabled: !!conversationId,
  });
  const [openArtifactId, setOpenArtifactId] = React.useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = React.useState<MediaAsset | null>(null);
  const openArtifact = artifacts.find((a) => a.id === openArtifactId) ?? null;
  const openArtifactById = React.useCallback(
    (id: string) => {
      setPreviewAsset(null);
      setOpenArtifactId(id);
      if (conversationId && !artifacts.some((a) => a.id === id)) {
        void queryClient.invalidateQueries({ queryKey: ["artifacts", conversationId] });
      }
    },
    [artifacts, conversationId, queryClient, setOpenArtifactId]
  );
  const openSkillRunAttachment = React.useCallback(
    (attachment: SkillRunAttachment) => {
      if (!attachment.url) return;
      setOpenArtifactId(null);
      setPreviewAsset({
        id: attachment.id,
        ownerId: user?.id ?? "",
        kind: "generated",
        name: attachment.name,
        mimeType: attachment.mimeType ?? "application/octet-stream",
        size: attachment.sizeBytes ?? 0,
        url: attachment.url,
        conversationId: conversationId ?? undefined,
        createdAt: new Date().toISOString(),
      });
    },
    [conversationId, user?.id]
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
  const { ensureSession, send, retrySend, stop, regenerate, switchBranch, setFeedback, clearRedirect, replaceMessageImage } =
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
      return currentConversation.modelId &&
        defaultableChatModelIds.has(currentConversation.modelId)
        ? currentConversation.modelId
        : defaultModelId || firstChatModelId || "";
    }
    if (!conversationId) {
      if (
        pendingSkill?.defaultModelId &&
        defaultableChatModelIds.has(pendingSkill.defaultModelId)
      ) {
        return pendingSkill.defaultModelId;
      }
      if (
        activeProject?.modelId &&
        defaultableChatModelIds.has(activeProject.modelId)
      ) {
        return activeProject.modelId;
      }
    }
    return defaultModelId || firstChatModelId || "";
  }, [
    conversationId,
    currentConversation,
    defaultModelId,
    defaultableChatModelIds,
    firstChatModelId,
    activeProject?.modelId,
    pendingSkill?.defaultModelId,
  ]);

  const resolveSelectableModelId = React.useCallback(
    (preferred?: string) => {
      if (preferred && defaultableChatModelIds.has(preferred)) return preferred;
      if (automaticModelId && defaultableChatModelIds.has(automaticModelId))
        return automaticModelId;
      if (defaultModelId && defaultableChatModelIds.has(defaultModelId))
        return defaultModelId;
      return firstChatModelId || "";
    },
    [
      automaticModelId,
      defaultModelId,
      defaultableChatModelIds,
      firstChatModelId,
    ]
  );

  const resolveComposerThinkingForModel = React.useCallback(
    (modelId: string) => {
      const model = defaultableChatModels.find((m) => m.id === modelId);
      return {
        extendedThinking: modelSupportsThinking(model),
        thinkingEffort: resolveModelThinkingEffort(model, modelThinkingEfforts),
      };
    },
    [defaultableChatModels, modelThinkingEfforts]
  );

  // 会话/技能/项目/默认模型共同决定自动模型；用户手动切换后不再覆盖。
  React.useEffect(() => {
    if (modelExplicitlySelectedRef.current) return;
    Promise.resolve().then(() => {
      setComposer((prev) => {
        const thinking = resolveComposerThinkingForModel(automaticModelId);
        if (
          prev.modelId === automaticModelId &&
          prev.extendedThinking === thinking.extendedThinking &&
          prev.thinkingEffort === thinking.thinkingEffort
        ) {
          return prev;
        }
        return { ...prev, modelId: automaticModelId, ...thinking };
      });
    });
  }, [automaticModelId, resolveComposerThinkingForModel]);

  React.useEffect(() => {
    if (!composer.modelId || defaultableChatModelIds.has(composer.modelId)) return;
    modelExplicitlySelectedRef.current = false;
    Promise.resolve().then(() => {
      setComposer((prev) => {
        if (!prev.modelId || defaultableChatModelIds.has(prev.modelId)) return prev;
        const modelId = resolveSelectableModelId(prev.modelId);
        return {
          ...prev,
          modelId,
          ...resolveComposerThinkingForModel(modelId),
        };
      });
    });
  }, [
    composer.modelId,
    defaultableChatModelIds,
    resolveSelectableModelId,
    resolveComposerThinkingForModel,
  ]);

  React.useEffect(() => {
    if (conversationId) return;
    Promise.resolve().then(() => {
      setComposer((prev) =>
        prev.styleId === effectiveDefaultStyleId
          ? prev
          : { ...prev, styleId: effectiveDefaultStyleId }
      );
    });
  }, [conversationId, effectiveDefaultStyleId]);

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
  const [activeMessageId, setActiveMessageId] = React.useState<string | null>(null);
  const atBottomRef = React.useRef(true);

  const updateActiveMessage = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nodes = Array.from(
      el.querySelectorAll<HTMLElement>("[data-chat-message-role='user']")
    );
    if (nodes.length === 0) {
      setActiveMessageId(null);
      return;
    }

    if (el.scrollTop <= 4) {
      const firstId = nodes[0]?.dataset.chatMessageId ?? null;
      setActiveMessageId((prev) => (prev === firstId ? prev : firstId));
      return;
    }

    const containerRect = el.getBoundingClientRect();
    const bottomActivationY = containerRect.bottom;
    let nextId = nodes[0]?.dataset.chatMessageId ?? null;
    for (const node of nodes) {
      if (node.getBoundingClientRect().top < bottomActivationY) {
        nextId = node.dataset.chatMessageId ?? nextId;
      } else {
        break;
      }
    }
    setActiveMessageId((prev) => (prev === nextId ? prev : nextId));
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottomRef.current = isBottom;
    setAtBottom(isBottom);
    updateActiveMessage();
  };

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    window.requestAnimationFrame(updateActiveMessage);
  }, [messages, updateActiveMessage]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  const scrollToMessage = React.useCallback(
    (messageId: string) => {
      document.getElementById(messageAnchorId(messageId))?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
      setActiveMessageId(messageId);
    },
    []
  );

  // 把指定模型设为用户默认（PATCH /api/me），并刷新用户缓存
  const setDefaultModel = async (mid: string) => {
    if (!user) return;
    const optimistic = optimisticPatchRecords<User>(
      queryClient,
      [["current-user"]],
      user.id,
      { defaultModelId: mid }
    );
    try {
      const saved = await getDataService().updateProfile({ defaultModelId: mid });
      optimistic.reconcile(saved);
      queryClient.invalidateQueries({ queryKey: ["models"] });
      queryClient.invalidateQueries({ queryKey: ["models", "with-default"] });
      toast.success("已设为默认模型");
    } catch (e) {
      optimistic.rollback();
      toast.error(e instanceof Error ? e.message : "设置失败");
    }
  };

  /** 新对话取消项目预选：去掉 URL 上的 ?project=，不影响已创建会话 */
  const clearPendingProject = React.useCallback(() => {
    setTemporaryProjectChat(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("project");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/");
  }, [router, searchParams]);

  // ---- 发送 ----
  const handleSend = (text: string, images: ImagePart[], files: FilePart[]) => {
    const optimisticConversationId =
      conversationId ??
      `c-${clientRandomUUID().replace(/-/g, "").slice(0, 16)}`;
    const activeConversationId = optimisticConversationId;
    const activeProjectId = pendingContext.projectId ?? currentConversation?.projectId;
    const shouldUseServerContextDefault =
      !conversationId &&
      (!!pendingContext.projectId || !!pendingContext.skillId) &&
      !modelExplicitlySelectedRef.current;
    const selectedModelId = resolveSelectableModelId(composer.modelId);
    void (async () => {
      try {
        await send({
          conversationId,
          ...(conversationId
            ? {}
            : { clientConversationId: optimisticConversationId }),
          text,
          images,
          attachments: files,
          quotedText,
          ...(shouldUseServerContextDefault || !selectedModelId
            ? {}
            : { modelId: selectedModelId }),
          styleId: composer.styleId,
          extendedThinking: composer.extendedThinking,
          thinkingEffort: composer.thinkingEffort,
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
    if (!conversationId) {
      const query = searchParams.toString();
      router.replace(`/chat/${optimisticConversationId}${query ? `?${query}` : ""}`);
    }
    setQuotedText(undefined);
  };

  const handleEditResend = (parentId: string | null) => (newText: string) => {
    if (!conversationId) return;
    const activeConversationId = conversationId;
    const activeProjectId = currentConversation?.projectId;
    const selectedModelId = resolveSelectableModelId(composer.modelId);
    void (async () => {
      try {
        await send({
          conversationId,
          parentId,
          text: newText,
          ...(selectedModelId ? { modelId: selectedModelId } : {}),
          styleId: composer.styleId,
          extendedThinking: composer.extendedThinking,
          thinkingEffort: composer.thinkingEffort,
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
    const selectedModelId =
      modelId && defaultableChatModelIds.has(modelId)
        ? modelId
        : resolveSelectableModelId(composer.modelId);
    void (async () => {
      try {
        await regenerate(activeConversationId, assistantMessageId, selectedModelId);
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
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "停止生成失败，请重试");
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
    const current = session.messages.find((message) => message.id === messageId);
    if (current && isSkillRunReceiptMessage(current)) return undefined;
    const siblings = session.messages.filter(
      (m) => m.parentId === parentId && !isSkillRunReceiptMessage(m)
    );
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
    const pendingProject =
      pendingContext.projectId && activeProject ? activeProject : null;
    const showProjectHeader = !!pendingProject && !pendingSkill;
    const projectUnavailable =
      !!pendingContext.projectId &&
      activeProjectFetched &&
      activeProject == null;
    const skillUnavailable =
      !!pendingContext.skillId && pendingSkillFetched && pendingSkill == null;
    const emptyPrompts = pendingProject
      ? PROJECT_SUGGESTED_PROMPTS.filter(
          (s) => !("requiresFiles" in s && s.requiresFiles) || pendingProject.files.length > 0
        )
      : suggestedPrompts;

    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
        <ChatHeader
          pendingProject={pendingProject}
          activeProject={pendingProject}
          onClearProject={pendingProject ? clearPendingProject : undefined}
        />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pt-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-3xl"
          >
            {showProjectHeader ? (
              <ProjectEmptyHeader project={pendingProject} />
            ) : showTemporaryProjectChat ? (
              <>
                <h1 className="mb-3 text-center font-serif text-3xl text-foreground/90">
                  临时对话
                </h1>
                <p className="mb-6 text-center text-sm text-muted-foreground">
                  这是临时对话，不会使用项目文件或关联知识库。
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
            {skillUnavailable && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                技能不可用，可能已被删除或没有访问权限。
              </div>
            )}
            {projectUnavailable && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                项目不可用，可能已被删除或没有访问权限。
              </div>
            )}
            {startError && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {startError}
              </div>
            )}
            <ChatInput
              models={defaultableChatModels}
              knowledgeBases={knowledgeBases}
              activeProject={activeProject}
              pendingProject={pendingProject}
              composer={composer}
              onComposerChange={handleComposerChange}
              isStreaming={isStartingNew}
              onSend={handleSend}
              // I11: 新会话首条响应期间也能停止（store/api-service 用哨兵键登记 controller）
              onStop={handleStop}
              defaultModelId={defaultModelId}
              onSetDefaultModel={setDefaultModel}
              activeSkill={activeSkill}
              autoFocus
            />
            <div className="mx-auto mt-2 grid max-w-2xl grid-cols-2 gap-2 px-4 sm:grid-cols-3">
              {emptyPrompts.map((s, i) => (
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
    <div className="relative flex h-full min-h-0 overflow-hidden">
      <div
        className={cn(
          "relative flex h-full min-h-0 min-w-0 flex-1 flex-col",
          openArtifact && "lg:w-[46%] lg:flex-none"
        )}
      >
        <ChatHeader
          conversation={currentConversation}
          activeProject={activeProject}
        />
        {!openArtifact && messageRailEnabled && (
          <ChatMessageRail
            messages={messages}
            activeMessageId={activeMessageId}
            onJump={scrollToMessage}
          />
        )}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-6 pt-[104px]">
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
              <div
                key={m.id}
                id={messageAnchorId(m.id)}
                data-chat-message-id={m.id}
                data-chat-message-role={m.role}
                className="scroll-mt-28"
              >
                <MessageItem
                  message={m}
                  isStreaming={isStreaming && session?.streamingMessageId === m.id}
                  models={defaultableChatModels}
                  branch={isStreaming ? undefined : branchInfo(m.id, m.parentId)}
                  onRegenerate={
                    m.role === "assistant" &&
                    !isStreaming &&
                    !isSkillRunReceiptMessage(m)
                      ? (modelId) => handleRegenerate(m.id, modelId)
                      : undefined
                  }
                  onEditResend={
                    m.role === "user" && !isStreaming && m.deliveryState !== "sending"
                      ? handleEditResend(m.parentId)
                      : undefined
                  }
                  onRetrySend={
                    m.role === "user" && m.deliveryState === "failed" && conversationId
                      ? () => void retrySend(conversationId, m.id)
                      : undefined
                  }
                  onFeedback={
                    m.role === "assistant" && !isSkillRunReceiptMessage(m)
                      ? (fb) => void setFeedback(conversationId, m.id, fb)
                      : undefined
                  }
                  onQuote={(text) => setQuotedText(text)}
                  onOpenArtifact={openArtifactById}
                  onOpenAttachment={openSkillRunAttachment}
                  onImageEdited={
                    conversationId
                      ? (oldUrl, newUrl, editPrompt) =>
                          replaceMessageImage(conversationId, m.id, oldUrl, newUrl, editPrompt)
                      : undefined
                  }
                />
              </div>
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
          models={defaultableChatModels}
          knowledgeBases={knowledgeBases}
          activeProject={activeProject}
          composer={composer}
          onComposerChange={handleComposerChange}
          modelThinkingEfforts={modelThinkingEfforts}
          onSetModelThinkingEffort={setModelThinkingEffort}
          onResetModelThinkingEffort={resetModelThinkingEffort}
          quotedText={quotedText}
          onClearQuote={() => setQuotedText(undefined)}
          isStreaming={!!isStreaming}
          onSend={handleSend}
          onStop={handleStop}
          defaultModelId={defaultModelId}
          onSetDefaultModel={setDefaultModel}
          activeSkill={activeSkill}
          isAdmin={user?.role === "admin"}
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
        {previewAsset && (
          <MediaPreviewPanel
            key={previewAsset.id}
            asset={previewAsset}
            onClose={() => setPreviewAsset(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

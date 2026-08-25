"use client";

import { create } from "zustand";
import { getDataService } from "@/lib/data";
import { replaceMessageImageParts } from "@/lib/message-image";
import { clientRandomUUID } from "@/lib/client-id";
import { isChatStreamTransportError } from "@/lib/data/chat-stream-transport";
import type {
  Message,
  MessagePart,
  SendMessageInput,
  StreamEvent,
} from "@/lib/types";

// I10: ensureSession 并发去重，按 conversationId 复用 in-flight promise
const ensureSessionInflight = new Map<string, Promise<void>>();
const resumeSessionInflight = new Map<string, Promise<void>>();
const CHAT_STREAM_WAKE_EVENT = "linhub:chat-stream-wake";
const RECONNECT_DELAYS_MS = [500, 1_500, 3_000, 5_000] as const;
const optimisticId = (prefix: "c" | "msg" | "cg") =>
  `${prefix}-${clientRandomUUID().replace(/-/g, "").slice(0, 16)}`;

function wakeChatStreamWaiters() {
  window.dispatchEvent(new Event(CHAT_STREAM_WAKE_EVENT));
}

/** 后台/离线时不空转；回到前台或恢复网络后立即给续接一次机会。 */
function waitForReconnectOpportunity(
  attempt: number,
  isCurrent: () => boolean
): Promise<boolean> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasWaitingForPage = false;
    const isReady = () =>
      document.visibilityState === "visible" && navigator.onLine !== false;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener(CHAT_STREAM_WAKE_EVENT, onWake);
    };
    const finish = (value: boolean) => {
      cleanup();
      resolve(value);
    };
    const trySchedule = () => {
      if (!isCurrent()) {
        finish(false);
        return;
      }
      if (!isReady()) {
        wasWaitingForPage = true;
        return;
      }
      if (timer) return;
      const delay = wasWaitingForPage
        ? 0
        : RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
      timer = setTimeout(() => {
        timer = undefined;
        if (!isCurrent()) {
          finish(false);
        } else if (isReady()) {
          finish(true);
        } else {
          wasWaitingForPage = true;
        }
      }, delay);
    };
    const onWake = () => trySchedule();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener(CHAT_STREAM_WAKE_EVENT, onWake);
    trySchedule();
  });
}

export interface ChatSession {
  conversationId: string;
  messages: Message[];
  status: "idle" | "streaming";
  streamingMessageId?: string;
  loaded: boolean;
  loadError?: string;
  streamError?: string;
  /** 当前展示分支的叶子消息 */
  currentLeafId?: string;
}

interface ChatState {
  sessions: Record<string, ChatSession>;
  /** 新会话创建后待跳转的 id */
  pendingRedirect: string | null;
  /** I11: 新会话首条响应是否进行中（用于在拿到 conversation-created 前显示停止按钮） */
  isStartingNew: boolean;
  /** 新会话在拿到 conversation-created 前失败时显示的错误。 */
  startError?: string;
  ensureSession: (conversationId: string) => Promise<void>;
  resume: (conversationId: string) => Promise<void>;
  /** 页面恢复可见时丢弃可能已僵死的订阅，并连接后台任务。 */
  reconnect: (conversationId: string) => void;
  send: (input: SendMessageInput) => Promise<void>;
  retrySend: (conversationId: string, userMessageId: string) => Promise<void>;
  stop: (conversationId?: string) => Promise<void>;
  regenerate: (
    conversationId: string,
    assistantMessageId: string,
    modelId?: string
  ) => Promise<void>;
  switchBranch: (conversationId: string, leafId: string) => void;
  setFeedback: (
    conversationId: string,
    messageId: string,
    feedback: "up" | "down" | null
  ) => Promise<void>;
  /** 乐观替换消息里的图片 URL（lightbox 编辑后用，并持久化到后端） */
  replaceMessageImage: (
    conversationId: string,
    messageId: string,
    oldUrl: string,
    newUrl: string,
    editPrompt?: string
  ) => Promise<void>;
  /** Skill Run 等后台卡片完成后，把服务端持久化的助手回执同步进当前会话。 */
  upsertBackgroundMessage: (conversationId: string, message: Message) => void;
  removeSession: (conversationId: string) => void;
  clearRedirect: () => void;
}

function emptySession(conversationId: string): ChatSession {
  return {
    conversationId,
    messages: [],
    status: "idle",
    loaded: false,
  };
}

/** 从叶子向上回溯出可见消息链 */
export function visibleThread(
  messages: Message[],
  leafId: string | undefined
): Message[] {
  if (messages.length === 0) return [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  let leaf = leafId ? byId.get(leafId) : undefined;
  if (!leaf) leaf = messages[messages.length - 1];
  const chain: Message[] = [];
  let cur: Message | undefined = leaf;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  // 后台任务回执是信息流事件，不应该抢占 currentLeaf 或成为普通对话分支。
  // 只要它关联的卡片消息位于当前分支，就按实际完成时间插入可见信息流。
  const chainIds = new Set(chain.map((message) => message.id));
  const receipts = messages.filter(
    (message) =>
      !chainIds.has(message.id) &&
      isSkillRunReceiptMessage(message) &&
      Boolean(message.parentId && chainIds.has(message.parentId))
  );
  return [...chain, ...receipts].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

export function isSkillRunReceiptMessage(message: Message) {
  return message.parts.some((part) => part.type === "skill-run-receipt");
}

/** 找到某消息子树中最新的叶子 */
export function deepestLeaf(messages: Message[], rootId: string): string {
  const children = (id: string) =>
    messages.filter((m) => m.parentId === id && !isSkillRunReceiptMessage(m));
  let cur = rootId;
  for (;;) {
    const kids = children(cur);
    if (kids.length === 0) return cur;
    cur = kids[kids.length - 1].id;
  }
}

function resolveCurrentLeafAfterReload(
  previousLeafId: string | undefined,
  serverLeafId: string | undefined,
  messages: Message[]
) {
  const ids = new Set(messages.map((m) => m.id));
  if (previousLeafId && ids.has(previousLeafId)) return previousLeafId;
  if (serverLeafId && ids.has(serverLeafId)) return serverLeafId;
  return messages[messages.length - 1]?.id;
}

function applyAssistantMessageEventSessionPatch(
  session: ChatSession,
  eventType: "assistant-start" | "assistant-snapshot",
  message: Message
): Pick<ChatSession, "status" | "streamingMessageId" | "currentLeafId"> {
  if (eventType === "assistant-start" || message.status === "streaming") {
    return {
      status: "streaming",
      streamingMessageId: message.id,
      currentLeafId: message.id,
    };
  }

  const snapshotOwnsCurrentStream = session.streamingMessageId === message.id;
  const snapshotOwnsCurrentLeaf =
    !session.currentLeafId || session.currentLeafId === message.id;

  return {
    status: snapshotOwnsCurrentStream ? "idle" : session.status,
    streamingMessageId: snapshotOwnsCurrentStream
      ? undefined
      : session.streamingMessageId,
    currentLeafId:
      snapshotOwnsCurrentStream || snapshotOwnsCurrentLeaf
        ? message.id
        : session.currentLeafId,
  };
}

export const useChatStore = create<ChatState>((set, get) => {
  // M11: sessions 上限，防止长时间使用后内存里堆积过多完整消息数组。
  const MAX_SESSIONS = 20;
  // 本标签页已经通过 POST/regenerate 持有同一任务的流时，不再额外 GET resume。
  // 否则新会话跳转后 ensureSession 会订阅同一个内存任务，delta 被应用两次。
  const localOwnedStreams = new Set<string>();
  const unacknowledgedLocalStreams = new Set<string>();
  // 删除/重置会话时递增版本，旧异步流或加载 promise 只能写回同版本的会话。
  const sessionVersions = new Map<string, number>();
  const failedSendInputs = new Map<string, SendMessageInput>();
  // 显式停止或开始下一次生成时递增；旧流即使稍后恢复也不能再写回或自动续接。
  const generationEpochs = new Map<string, number>();
  let newConversationEpoch = 0;
  let startingConversationClientId: string | undefined;
  const sessionVersion = (conversationId: string) =>
    sessionVersions.get(conversationId) ?? 0;
  const bumpSessionVersion = (conversationId: string) => {
    sessionVersions.set(conversationId, sessionVersion(conversationId) + 1);
  };
  const generationEpoch = (conversationId: string) =>
    generationEpochs.get(conversationId) ?? 0;
  const beginGeneration = (conversationId: string) => {
    const next = generationEpoch(conversationId) + 1;
    generationEpochs.set(conversationId, next);
    wakeChatStreamWaiters();
    return next;
  };
  const invalidateGeneration = (conversationId: string) => {
    generationEpochs.set(conversationId, generationEpoch(conversationId) + 1);
    wakeChatStreamWaiters();
  };
  const requestResume = (conversationId: string) => {
    const inflight = resumeSessionInflight.get(conversationId);
    if (!inflight) {
      void get().resume(conversationId);
      return;
    }
    void inflight.then(() => {
      if (
        get().sessions[conversationId]?.status === "streaming" &&
        !localOwnedStreams.has(conversationId)
      ) {
        void get().resume(conversationId);
      }
    });
  };

  /** 把 sessions 裁剪到 MAX_SESSIONS 以内，优先丢弃非流式的已加载会话 */
  const pruneSessions = (
    sessions: Record<string, ChatSession>,
    keepId?: string
  ) => {
    const ids = Object.keys(sessions);
    if (ids.length <= MAX_SESSIONS) return sessions;
    // 保留所有 streaming 中的；其余按 loaded 程度（已加载的更可丢弃）排序后淘汰
    const survivors = ids.filter(
      (id) => id === keepId || sessions[id].status === "streaming"
    );
    const candidates = ids
      .filter((id) => id !== keepId && sessions[id].status !== "streaming")
      .sort((a, b) => Number(sessions[b].loaded) - Number(sessions[a].loaded));
    while (survivors.length < MAX_SESSIONS && candidates.length) {
      survivors.push(candidates.pop()!);
    }
    const next: Record<string, ChatSession> = {};
    for (const id of survivors) next[id] = sessions[id];
    return next;
  };

  const updateSession = (
    conversationId: string,
    updater: (s: ChatSession) => ChatSession,
    expectedVersion = sessionVersion(conversationId)
  ) => {
    if (sessionVersion(conversationId) !== expectedVersion) return;
    set((state) => {
      if (sessionVersion(conversationId) !== expectedVersion) return state;
      const session = state.sessions[conversationId] ?? emptySession(conversationId);
      return {
        sessions: pruneSessions({
          ...state.sessions,
          [conversationId]: updater(session),
        }, conversationId),
      };
    });
  };

  const upsertMessage = (messages: Message[], message: Message) => {
    const index = messages.findIndex((m) => m.id === message.id);
    if (index === -1) return [...messages, message];
    const existing = messages[index];
    const next = [...messages];
    const existingProgress = messageVisibleProgress(existing.parts);
    const incomingProgress = messageVisibleProgress(message.parts);
    next[index] =
      existing.parts.length > 0 && incomingProgress < existingProgress
        ? {
            ...existing,
            ...message,
            parts: existing.parts,
            usage: message.usage ?? existing.usage,
          }
        : { ...existing, ...message };
    return next;
  };

  const mergeLoadedMessages = (current: Message[], incoming: Message[]) =>
    incoming.reduce((messages, message) => upsertMessage(messages, message), current);

  const prepareOptimisticSend = (rawInput: SendMessageInput) => {
    const conversationId =
      rawInput.conversationId ?? rawInput.clientConversationId ?? optimisticId("c");
    const clientGenerationId = rawInput.clientGenerationId ?? optimisticId("cg");
    const userMessageId = rawInput.clientUserMessageId ?? optimisticId("msg");
    const assistantMessageId = rawInput.clientAssistantMessageId ?? optimisticId("msg");
    const session = get().sessions[conversationId] ?? emptySession(conversationId);
    const parentId =
      rawInput.parentId !== undefined
        ? rawInput.parentId
        : session.currentLeafId ?? null;
    const input: SendMessageInput = {
      ...rawInput,
      clientGenerationId,
      clientConversationId: rawInput.conversationId ? undefined : conversationId,
      clientUserMessageId: userMessageId,
      clientAssistantMessageId: assistantMessageId,
      parentId,
    };
    const createdAt = new Date().toISOString();
    const userMessage: Message = {
      id: userMessageId,
      conversationId,
      parentId,
      role: "user",
      parts: [
        ...(input.images ?? []),
        ...(input.attachments ?? []),
        { type: "text", text: input.text },
        { type: "tool-config", tools: input.tools },
      ],
      quotedText: input.quotedText,
      createdAt,
      status: "complete",
      deliveryState: "sending",
      clientOperationId: clientGenerationId,
    };
    const assistantMessage: Message = {
      id: assistantMessageId,
      conversationId,
      parentId: userMessageId,
      role: "assistant",
      modelId: input.modelId,
      parts: [],
      createdAt,
      status: "streaming",
      clientOperationId: clientGenerationId,
    };
    updateSession(conversationId, (current) => ({
      ...current,
      loaded: true,
      loadError: undefined,
      streamError: undefined,
      status: "streaming",
      streamingMessageId: assistantMessageId,
      currentLeafId: assistantMessageId,
      messages: upsertMessage(
        upsertMessage(current.messages, userMessage),
        assistantMessage
      ),
    }));
    failedSendInputs.set(userMessageId, input);
    return { input, conversationId, userMessageId, assistantMessageId };
  };

  const failOptimisticSend = (
    conversationId: string,
    userMessageId: string,
    assistantMessageId: string,
    message: string,
    accepted: boolean
  ) => {
    updateSession(conversationId, (session) => ({
      ...session,
      status: "idle",
      streamingMessageId:
        session.streamingMessageId === assistantMessageId
          ? undefined
          : session.streamingMessageId,
      currentLeafId:
        session.currentLeafId === assistantMessageId
          ? accepted
            ? assistantMessageId
            : userMessageId
          : session.currentLeafId,
      streamError: message,
      messages: session.messages.map((item) => {
        if (item.id === userMessageId) {
          return accepted
            ? { ...item, deliveryState: "accepted" as const, deliveryError: undefined }
            : {
                ...item,
                deliveryState: "failed" as const,
                deliveryError: message,
              };
        }
        if (item.id === assistantMessageId) {
          return accepted
            ? {
                ...item,
                status: "error" as const,
                parts:
                  item.parts.length > 0
                    ? item.parts
                    : [{ type: "text" as const, text: `⚠️ ${message}` }],
              }
            : item;
        }
        return item;
      }).filter((item) => accepted || item.id !== assistantMessageId),
    }));
    if (accepted) failedSendInputs.delete(userMessageId);
  };

  const messageVisibleProgress = (parts: MessagePart[]) =>
    parts.reduce((total, part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return total + part.text.length;
      }
      if (part.type === "tool-call") {
        return (
          total +
          32 +
          JSON.stringify(part.args).length +
          (part.inputPreview?.length ?? 0) +
          (part.result ? JSON.stringify(part.result).length : 0)
        );
      }
      if (part.type === "image" || part.type === "file") return total + 64;
      return total;
    }, 0);

  /** 把流式事件应用到会话状态 */
  const applyEvent = (
    conversationId: string,
    event: StreamEvent,
    expectedVersion = sessionVersion(conversationId)
  ) => {
    const update = (updater: (s: ChatSession) => ChatSession) =>
      updateSession(conversationId, updater, expectedVersion);
    switch (event.type) {
      case "user-message":
      case "assistant-start":
      case "assistant-snapshot": {
        const existing = get().sessions[conversationId]?.messages.find(
          (item) => item.id === event.message.id
        );
        const message =
          event.type === "user-message"
            ? {
                ...event.message,
                deliveryState: "accepted" as const,
                deliveryError: undefined,
                clientOperationId: existing?.clientOperationId,
              }
            : {
                ...event.message,
                clientOperationId: existing?.clientOperationId,
              };
        if (event.type === "user-message") {
          failedSendInputs.delete(message.id);
        }
        update((s) => ({
          ...s,
          ...(event.type === "user-message"
            ? { currentLeafId: message.id }
            : applyAssistantMessageEventSessionPatch(s, event.type, message)),
          messages: upsertMessage(s.messages, message),
          streamError: undefined,
        }));
        break;
      }
      case "routing-decision": {
        update((s) => ({
          ...s,
          streamError: undefined,
          messages: s.messages.map((m) => {
            if (m.id !== event.messageId) return m;
            const parts = [...m.parts];
            const index = parts.findIndex((part) => part.type === "tool-config");
            const nextConfig: MessagePart = {
              type: "tool-config",
              tools: event.decision.finalTools,
              routing: event.decision,
            };
            if (index >= 0) {
              const existing = parts[index];
              parts[index] =
                existing.type === "tool-config"
                  ? {
                      ...existing,
                      originalTools: existing.originalTools ?? existing.tools,
                      tools: event.decision.finalTools,
                      routing: event.decision,
                    }
                  : nextConfig;
            } else {
              parts.push(nextConfig);
            }
            return { ...m, parts };
          }),
        }));
        break;
      }
      case "reasoning-delta":
      case "text-delta": {
        const partType = event.type === "reasoning-delta" ? "reasoning" : "text";
        if (partType === "reasoning" && event.delta.length === 0) break;
        update((s) => ({
          ...s,
          streamError: undefined,
          messages: s.messages.map((m) => {
            if (m.id !== event.messageId) return m;
            const parts = [...m.parts];
            const last = parts[parts.length - 1];
            if (last && last.type === partType) {
              parts[parts.length - 1] = {
                ...last,
                text: last.text + event.delta,
              } as MessagePart;
            } else {
              parts.push({ type: partType, text: event.delta } as MessagePart);
            }
            return { ...m, parts };
          }),
        }));
        break;
      }
      case "reasoning-done": {
        update((s) => ({
          ...s,
          streamError: undefined,
          messages: s.messages.map((m) => {
            if (m.id !== event.messageId) return m;
            const parts = m.parts.map((p) =>
              p.type === "reasoning" ? { ...p, durationMs: event.durationMs } : p
            );
            return { ...m, parts };
          }),
        }));
        break;
      }
      case "tool-call-start": {
        update((s) => ({
          ...s,
          messages: s.messages.map((m) => {
            if (m.id !== event.messageId) return m;
            const has = m.parts.some(
              (p) =>
                p.type === "tool-call" && p.toolCallId === event.part.toolCallId
            );
            return {
              ...m,
              parts: has
                ? m.parts.map((p) =>
                    p.type === "tool-call" &&
                    p.toolCallId === event.part.toolCallId
                      ? event.part
                      : p
                  )
                : [...m.parts, event.part],
            };
          }),
        }));
        break;
      }
      case "tool-call-end": {
        update((s) => ({
          ...s,
          messages: s.messages.map((m) => {
            if (m.id !== event.messageId) return m;
            const has = m.parts.some(
              (p) =>
                p.type === "tool-call" && p.toolCallId === event.part.toolCallId
            );
            return {
              ...m,
              parts: has
                ? m.parts.map((p) =>
                    p.type === "tool-call" &&
                    p.toolCallId === event.part.toolCallId
                      ? event.part
                      : p
                  )
                : [...m.parts, event.part],
            };
          }),
        }));
        break;
      }
      case "tool-input-start":
        // tool-call-start 已在后端 emit 时建好 part，这里无需处理
        break;
      case "tool-input-delta": {
        update((s) => ({
          ...s,
          messages: s.messages.map((m) => {
            if (m.id !== event.messageId) return m;
            return {
              ...m,
              parts: m.parts.map((p) =>
                p.type === "tool-call" && p.toolCallId === event.toolCallId
                  ? {
                      ...p,
                      inputPreview: (p.inputPreview ?? "") + event.delta,
                    }
                  : p
              ),
            };
          }),
        }));
        break;
      }
      case "image": {
        update((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === event.messageId
              ? { ...m, parts: [...m.parts, event.part] }
              : m
          ),
        }));
        break;
      }
      case "artifact": {
        // Artifact 本体由 React Query 列表维护；这里无需把完整代码塞入消息，
        // 事件到达后 ChatView 会根据成功的工具调用刷新 artifacts 查询。
        break;
      }
      case "done": {
        update((s) => ({
          ...s,
          ...(s.streamingMessageId === event.messageId
            ? { status: "idle" as const, streamingMessageId: undefined }
            : {}),
          streamError: undefined,
          messages: s.messages.map((m) =>
            m.id === event.messageId
              ? { ...m, status: event.status, usage: event.usage }
              : m
          ),
        }));
        break;
      }
      case "error": {
        update((s) => ({
          ...s,
          ...(event.messageId && s.streamingMessageId !== event.messageId
            ? {}
            : { status: "idle" as const, streamingMessageId: undefined }),
          streamError: event.message,
          messages: s.messages.map((m) =>
            event.messageId && m.id === event.messageId
              ? {
                  ...m,
                  status: "error",
                  parts:
                    m.parts.length > 0
                      ? m.parts
                      : [{ type: "text", text: `⚠️ ${event.message}` }],
                }
              : m
          ),
        }));
        break;
      }
      // I13: 心跳事件，仅维持连接，无需更新状态
      case "ping": {
        break;
      }
    }
  };

  return {
    sessions: {},
    pendingRedirect: null,
    isStartingNew: false,
    startError: undefined,

    clearRedirect: () => set({ pendingRedirect: null }),

    upsertBackgroundMessage: (conversationId, message) => {
      updateSession(conversationId, (session) => ({
        ...session,
        messages: upsertMessage(session.messages, message),
      }));
    },

    removeSession: (conversationId) => {
      bumpSessionVersion(conversationId);
      invalidateGeneration(conversationId);
      ensureSessionInflight.delete(conversationId);
      resumeSessionInflight.delete(conversationId);
      localOwnedStreams.delete(conversationId);
      unacknowledgedLocalStreams.delete(conversationId);
      set((state) => {
        if (!state.sessions[conversationId]) return state;
        const sessions = { ...state.sessions };
        delete sessions[conversationId];
        return { sessions };
      });
    },

    ensureSession: async (conversationId) => {
      const existing = get().sessions[conversationId];
      if (existing?.loaded) {
        // 重新进入已加载会话时也尝试一次续接，捕捉其他标签页刚启动的生成。
        if (existing.status === "streaming") {
          get().reconnect(conversationId);
        } else if (!localOwnedStreams.has(conversationId)) {
          void get().resume(conversationId);
        }
        return;
      }
      // I10: 去重——并发调用复用同一个 in-flight promise，
      // 避免 StrictMode 双调用或快速导航发两份并行请求。
      const inflight = ensureSessionInflight.get(conversationId);
      if (inflight) return inflight;
      const expectedVersion = sessionVersion(conversationId);
      const p = (async () => {
        try {
          const [conversation, messages] = await Promise.all([
            getDataService().getConversation(conversationId),
            getDataService().listMessages(conversationId),
          ]);
          if (sessionVersion(conversationId) !== expectedVersion) return;
          const streamingMessage = messages.find(
            (m) => m.role === "assistant" && m.status === "streaming"
          );
          updateSession(conversationId, (s) => ({
            ...s,
            messages: mergeLoadedMessages(s.messages, messages),
            status: streamingMessage ? "streaming" : "idle",
            streamingMessageId: streamingMessage?.id,
            loaded: true,
            loadError: undefined,
            streamError: undefined,
            currentLeafId: resolveCurrentLeafAfterReload(
              s.currentLeafId,
              conversation?.currentLeafId,
              messages
            ),
          }), expectedVersion);
          // 即使这次拉取尚未看到 streaming assistant，也尝试挂一次续接流。
          // 另一个浏览器可能正好在 assistant 行落库前打开会话；后端若有
          // chatTasks 活跃任务，会通过这个 GET 订阅后续事件，否则会立即空流返回。
          if (
            sessionVersion(conversationId) === expectedVersion &&
            !localOwnedStreams.has(conversationId)
          ) {
            void get().resume(conversationId);
          }
        } catch (e) {
          // 会话加载失败时不要形成浏览器 unhandled rejection；
          // 保留可重试状态，避免一次 503 被误判成“会话不存在”。
          updateSession(conversationId, (s) => ({
            ...s,
            loaded: false,
            loadError: e instanceof Error ? e.message : "会话加载失败",
          }), expectedVersion);
        } finally {
          ensureSessionInflight.delete(conversationId);
        }
      })();
      ensureSessionInflight.set(conversationId, p);
      return p;
    },

    resume: async (conversationId) => {
      const existing = resumeSessionInflight.get(conversationId);
      if (existing) return existing;
      const expectedVersion = sessionVersion(conversationId);
      const expectedGeneration = generationEpoch(conversationId);
      const isCurrent = () =>
        sessionVersion(conversationId) === expectedVersion &&
        generationEpoch(conversationId) === expectedGeneration;
      const p = (async () => {
        let reconnectAttempt = 0;
        try {
          while (isCurrent()) {
            let transportInterrupted = false;
            try {
              for await (const event of getDataService().streamConversation(conversationId)) {
                if (!isCurrent()) break;
                reconnectAttempt = 0;
                applyEvent(conversationId, event, expectedVersion);
              }
            } catch (error) {
              if (isChatStreamTransportError(error)) {
                transportInterrupted = true;
              } else {
                applyEvent(
                  conversationId,
                  {
                    type: "error",
                    message: error instanceof Error ? error.message : "续接对话失败",
                  },
                  expectedVersion
                );
              }
            }
            if (!isCurrent()) break;

            // 每次订阅结束后都以 DB 为准，补齐断线期间错过的完整快照和最终状态。
            try {
              const [conversation, messages] = await Promise.all([
                getDataService().getConversation(conversationId),
                getDataService().listMessages(conversationId),
              ]);
              if (!isCurrent()) break;
              const streamingMessage = messages.find(
                (m) => m.role === "assistant" && m.status === "streaming"
              );
              updateSession(conversationId, (s) => ({
                ...s,
                messages: mergeLoadedMessages(s.messages, messages),
                status: streamingMessage ? "streaming" : "idle",
                streamingMessageId: streamingMessage?.id,
                loaded: true,
                loadError: undefined,
                streamError: undefined,
                currentLeafId: resolveCurrentLeafAfterReload(
                  s.currentLeafId,
                  conversation?.currentLeafId,
                  messages
                ),
              }), expectedVersion);
            } catch {
              // 临时网络错误不覆盖当前可见内容，下面按流式状态决定是否重连。
              transportInterrupted = true;
            }

            if (!isCurrent()) break;
            const stillStreaming =
              get().sessions[conversationId]?.status === "streaming";
            if (!stillStreaming) break;
            const shouldReconnect = await waitForReconnectOpportunity(
              reconnectAttempt,
              isCurrent
            );
            if (!shouldReconnect) break;
            reconnectAttempt = transportInterrupted
              ? reconnectAttempt + 1
              : Math.max(1, reconnectAttempt);
          }
        } finally {
          resumeSessionInflight.delete(conversationId);
        }
      })();
      resumeSessionInflight.set(conversationId, p);
      return p;
    },

    reconnect: (conversationId) => {
      const session = get().sessions[conversationId];
      if (session?.status !== "streaming") return;
      // 首次 POST/重新生成尚未得到服务端确认时，先关闭可能僵死的 POST；
      // 原发送流程会用相同幂等 ID 重试，不能在这里提前改走 GET。
      if (unacknowledgedLocalStreams.has(conversationId)) {
        getDataService().disconnectChatStream(conversationId);
        wakeChatStreamWaiters();
        return;
      }
      getDataService().disconnectChatStream(conversationId);
      localOwnedStreams.delete(conversationId);
      requestResume(conversationId);
    },

    send: async (input) => {
      // I8: 并发守卫——同一会话已有流式进行时，拒绝新的 send/regenerate，
      // 防止两条流写同一 messageId 的 text-delta 造成竞态 corrupt。
      if (input.conversationId) {
        const s = get().sessions[input.conversationId];
        if (s?.status === "streaming") return;
      } else if (get().isStartingNew) {
        return;
      }
      const optimistic = prepareOptimisticSend(input);
      input = optimistic.input;
      // I11: 新会话首条响应标记进行中，用于在 / 页面显示停止按钮
      const isNewConversation = !input.conversationId;
      if (isNewConversation) set({ isStartingNew: true, startError: undefined });
      let conversationId = optimistic.conversationId;
      let expectedVersion = sessionVersion(conversationId);
      let accepted = false;
      let terminal = false;
      let reconnectAttempt = 0;
      let shouldResume = false;
      const expectedNewConversationEpoch = newConversationEpoch;
      const expectedGeneration = beginGeneration(conversationId);
      const isCurrent = () =>
        sessionVersion(conversationId) === expectedVersion &&
        generationEpoch(conversationId) === expectedGeneration &&
        (!isNewConversation || newConversationEpoch === expectedNewConversationEpoch);
      localOwnedStreams.add(conversationId);
      unacknowledgedLocalStreams.add(conversationId);
      if (isNewConversation) startingConversationClientId = conversationId;
      try {
        while (isCurrent() && !terminal) {
          let transportInterrupted = false;
          try {
            for await (const event of getDataService().sendMessage(input)) {
              reconnectAttempt = 0;
              if (event.type === "conversation-created") {
                const previousConversationId = conversationId;
                conversationId = event.conversation.id;
                if (isNewConversation) startingConversationClientId = conversationId;
                expectedVersion = sessionVersion(conversationId);
                if (conversationId !== previousConversationId) {
                  generationEpochs.set(conversationId, expectedGeneration);
                  localOwnedStreams.delete(previousConversationId);
                  unacknowledgedLocalStreams.delete(previousConversationId);
                }
                localOwnedStreams.add(conversationId);
                if (!accepted) unacknowledgedLocalStreams.add(conversationId);
                set((state) => ({
                  sessions: {
                    ...state.sessions,
                    [conversationId!]: {
                      ...(state.sessions[conversationId!] ?? emptySession(conversationId!)),
                      loaded: true,
                    },
                  },
                  pendingRedirect: conversationId,
                }));
                continue;
              }
              if (
                event.type === "user-message" &&
                event.message.id === optimistic.userMessageId
              ) {
                accepted = true;
                unacknowledgedLocalStreams.delete(conversationId);
              }
              if (event.type === "done" || event.type === "error") terminal = true;
              if (event.type === "error") {
                if (isNewConversation) set({ startError: event.message });
                failOptimisticSend(
                  conversationId,
                  optimistic.userMessageId,
                  optimistic.assistantMessageId,
                  event.message,
                  accepted
                );
              }
              if (!isCurrent()) break;
              applyEvent(conversationId, event, expectedVersion);
            }
          } catch (error) {
            if (isChatStreamTransportError(error)) {
              transportInterrupted = true;
            } else {
              const message = error instanceof Error ? error.message : "发送失败";
              failOptimisticSend(
                conversationId,
                optimistic.userMessageId,
                optimistic.assistantMessageId,
                message,
                accepted
              );
              terminal = true;
            }
          }

          if (terminal || !isCurrent()) break;
          if (accepted) {
            // POST 已被服务端确认，后续只需 GET 订阅后台任务，不能重复提交生成。
            shouldResume = true;
            break;
          }
          // 尚未收到 user-message 时无法确认 POST 是否到达；复用同一组 client* ID
          // 重试，服务端会幂等地返回既有任务或只创建一次。
          const shouldRetry = await waitForReconnectOpportunity(
            reconnectAttempt,
            isCurrent
          );
          if (!shouldRetry) break;
          reconnectAttempt = transportInterrupted
            ? reconnectAttempt + 1
            : Math.max(1, reconnectAttempt);
        }
      } finally {
        localOwnedStreams.delete(conversationId);
        unacknowledgedLocalStreams.delete(conversationId);
        if (startingConversationClientId === conversationId) {
          startingConversationClientId = undefined;
        }
        if (isNewConversation) set({ isStartingNew: false });
        if (
          shouldResume &&
          isCurrent() &&
          get().sessions[conversationId]?.status === "streaming"
        ) {
          requestResume(conversationId);
        }
      }
    },

    retrySend: async (conversationId, userMessageId) => {
      const input = failedSendInputs.get(userMessageId);
      if (!input) return;
      updateSession(conversationId, (session) => ({
        ...session,
        status: "idle",
        streamError: undefined,
      }));
      await get().send(input);
    },

    stop: async (conversationId) => {
      // abort 后 fetch 会抛 AbortError，streamNdjson 静默吞掉，
      // done/error 事件不会到达，session 会永远卡在 streaming → 下次发送被守卫拒绝。
      // 这里主动把状态重置回 idle，并把进行中的消息标记为 stopped。
      // 新会话首条消息（conversationId 未知）由 send 的 finally 清 isStartingNew，无需处理。
      if (conversationId) {
        invalidateGeneration(conversationId);
        unacknowledgedLocalStreams.delete(conversationId);
        updateSession(conversationId, (s) => ({
          ...s,
          status: "idle",
          streamingMessageId: undefined,
          streamError: undefined,
          messages: s.messages.map((m) =>
            m.id === s.streamingMessageId ? { ...m, status: "stopped" } : m
          ),
        }));
      } else {
        newConversationEpoch += 1;
        if (startingConversationClientId) {
          const startingId = startingConversationClientId;
          invalidateGeneration(startingId);
          unacknowledgedLocalStreams.delete(startingId);
          updateSession(startingId, (s) => ({
            ...s,
            status: "idle",
            streamingMessageId: undefined,
            streamError: undefined,
            messages: s.messages.map((message) =>
              message.id === s.streamingMessageId
                ? { ...message, status: "stopped" }
                : message
            ),
          }));
        }
        wakeChatStreamWaiters();
        set({ startError: undefined });
      }
      await getDataService().stopGeneration(conversationId);
    },

    regenerate: async (conversationId, assistantMessageId, modelId) => {
      // I8: 并发守卫——同 send
      const s = get().sessions[conversationId];
      if (s?.status === "streaming") return;
      const target = s?.messages.find((message) => message.id === assistantMessageId);
      if (!target?.parentId) return;
      const clientGenerationId = optimisticId("cg");
      const clientAssistantMessageId = optimisticId("msg");
      const optimisticAssistant: Message = {
        id: clientAssistantMessageId,
        conversationId,
        parentId: target.parentId,
        role: "assistant",
        modelId: modelId ?? target.modelId,
        parts: [],
        createdAt: new Date().toISOString(),
        status: "streaming",
        clientOperationId: clientGenerationId,
      };
      updateSession(conversationId, (session) => ({
        ...session,
        status: "streaming",
        streamingMessageId: clientAssistantMessageId,
        currentLeafId: clientAssistantMessageId,
        streamError: undefined,
        messages: upsertMessage(session.messages, optimisticAssistant),
      }));
      localOwnedStreams.add(conversationId);
      unacknowledgedLocalStreams.add(conversationId);
      const expectedVersion = sessionVersion(conversationId);
      const expectedGeneration = beginGeneration(conversationId);
      const isCurrent = () =>
        sessionVersion(conversationId) === expectedVersion &&
        generationEpoch(conversationId) === expectedGeneration;
      let terminal = false;
      let acknowledged = false;
      let reconnectAttempt = 0;
      let shouldResume = false;
      try {
        while (isCurrent() && !terminal) {
          let transportInterrupted = false;
          try {
            for await (const event of getDataService().regenerate(
              conversationId,
              assistantMessageId,
              modelId,
              { clientGenerationId, clientAssistantMessageId }
            )) {
              reconnectAttempt = 0;
              if (event.type !== "ping") {
                acknowledged = true;
                unacknowledgedLocalStreams.delete(conversationId);
              }
              if (event.type === "done" || event.type === "error") terminal = true;
              if (!isCurrent()) break;
              applyEvent(conversationId, event, expectedVersion);
            }
          } catch (error) {
            if (isChatStreamTransportError(error)) {
              transportInterrupted = true;
            } else {
              applyEvent(
                conversationId,
                {
                  type: "error",
                  messageId: clientAssistantMessageId,
                  message: error instanceof Error ? error.message : "重新生成失败",
                },
                expectedVersion
              );
              terminal = true;
            }
          }
          if (terminal || !isCurrent()) break;
          if (acknowledged) {
            shouldResume = true;
            break;
          }
          const shouldRetry = await waitForReconnectOpportunity(
            reconnectAttempt,
            isCurrent
          );
          if (!shouldRetry) break;
          reconnectAttempt = transportInterrupted
            ? reconnectAttempt + 1
            : Math.max(1, reconnectAttempt);
        }
      } finally {
        localOwnedStreams.delete(conversationId);
        unacknowledgedLocalStreams.delete(conversationId);
        if (
          shouldResume &&
          isCurrent() &&
          get().sessions[conversationId]?.status === "streaming"
        ) {
          requestResume(conversationId);
        }
      }
    },

    switchBranch: (conversationId, leafId) => {
      const previousLeafId = get().sessions[conversationId]?.currentLeafId;
      updateSession(conversationId, (s) => ({ ...s, currentLeafId: leafId }));
      void getDataService()
        .updateConversation(conversationId, { currentLeafId: leafId })
        .catch(() => {
          updateSession(conversationId, (session) =>
            session.currentLeafId === leafId
              ? { ...session, currentLeafId: previousLeafId }
              : session
          );
        });
    },

    replaceMessageImage: async (conversationId, messageId, oldUrl, newUrl, editPrompt) => {
      const originalParts = get()
        .sessions[conversationId]?.messages.find((m) => m.id === messageId)
        ?.parts;
      updateSession(conversationId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                parts: replaceMessageImageParts(m.parts, oldUrl, newUrl, editPrompt).parts,
              }
            : m
        ),
      }));
      try {
        await getDataService().replaceMessageImage(messageId, oldUrl, newUrl, editPrompt);
      } catch (e) {
        updateSession(conversationId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === messageId && m.parts.some((p) => p.type === "image" && p.url === newUrl)
              ? {
                  ...m,
                  parts: originalParts ?? m.parts,
                }
              : m
          ),
        }));
        throw e;
      }
    },

    setFeedback: async (conversationId, messageId, feedback) => {
      // I9: 记录原值以便服务端失败时回滚乐观更新
      const prev = get().sessions[conversationId]?.messages.find(
        (m) => m.id === messageId
      )?.feedback;
      updateSession(conversationId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, feedback: feedback ?? undefined } : m
        ),
      }));
      try {
        await getDataService().setFeedback(messageId, feedback);
      } catch {
        // 回滚到原值，避免 UI 与服务端不一致
        updateSession(conversationId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === messageId ? { ...m, feedback: prev } : m
          ),
        }));
      }
    },
  };
});

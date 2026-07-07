"use client";

import { create } from "zustand";
import { getDataService } from "@/lib/data";
import type {
  Message,
  MessagePart,
  SendMessageInput,
  StreamEvent,
} from "@/lib/types";

// I10: ensureSession 并发去重，按 conversationId 复用 in-flight promise
const ensureSessionInflight = new Map<string, Promise<void>>();
const resumeSessionInflight = new Map<string, Promise<void>>();

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
  send: (input: SendMessageInput) => Promise<void>;
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
    newUrl: string
  ) => Promise<void>;
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
  return chain;
}

/** 找到某消息子树中最新的叶子 */
export function deepestLeaf(messages: Message[], rootId: string): string {
  const children = (id: string) =>
    messages.filter((m) => m.parentId === id);
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
    updater: (s: ChatSession) => ChatSession
  ) => {
    set((state) => {
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
  const applyEvent = (conversationId: string, event: StreamEvent) => {
    switch (event.type) {
      case "user-message":
      case "assistant-start":
      case "assistant-snapshot": {
        const message = event.message;
        updateSession(conversationId, (s) => ({
          ...s,
          ...(event.type === "user-message"
            ? { currentLeafId: message.id }
            : applyAssistantMessageEventSessionPatch(s, event.type, message)),
          messages: upsertMessage(s.messages, message),
          streamError: undefined,
        }));
        break;
      }
      case "reasoning-delta":
      case "text-delta": {
        const partType = event.type === "reasoning-delta" ? "reasoning" : "text";
        if (partType === "reasoning" && event.delta.length === 0) break;
        updateSession(conversationId, (s) => ({
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
        updateSession(conversationId, (s) => ({
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
        updateSession(conversationId, (s) => ({
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
        updateSession(conversationId, (s) => ({
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
        updateSession(conversationId, (s) => ({
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
        updateSession(conversationId, (s) => ({
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
        updateSession(conversationId, (s) => ({
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
        updateSession(conversationId, (s) => ({
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

    ensureSession: async (conversationId) => {
      const existing = get().sessions[conversationId];
      if (existing?.loaded) {
        // 重新进入已加载会话时也尝试一次续接，捕捉其他标签页刚启动的生成。
        if (!localOwnedStreams.has(conversationId)) void get().resume(conversationId);
        return;
      }
      // I10: 去重——并发调用复用同一个 in-flight promise，
      // 避免 StrictMode 双调用或快速导航发两份并行请求。
      const inflight = ensureSessionInflight.get(conversationId);
      if (inflight) return inflight;
      const p = (async () => {
        try {
          const [conversation, messages] = await Promise.all([
            getDataService().getConversation(conversationId),
            getDataService().listMessages(conversationId),
          ]);
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
          }));
          // 即使这次拉取尚未看到 streaming assistant，也尝试挂一次续接流。
          // 另一个浏览器可能正好在 assistant 行落库前打开会话；后端若有
          // chatTasks 活跃任务，会通过这个 GET 订阅后续事件，否则会立即空流返回。
          if (!localOwnedStreams.has(conversationId)) void get().resume(conversationId);
        } catch (e) {
          // 会话加载失败时不要形成浏览器 unhandled rejection；
          // 保留可重试状态，避免一次 503 被误判成“会话不存在”。
          updateSession(conversationId, (s) => ({
            ...s,
            loaded: false,
            loadError: e instanceof Error ? e.message : "会话加载失败",
          }));
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
      const p = (async () => {
        try {
          for await (const event of getDataService().streamConversation(conversationId)) {
            applyEvent(conversationId, event);
          }
        } finally {
          resumeSessionInflight.delete(conversationId);
          // 流结束后拉一次最终状态，补齐刷新/跨浏览器期间可能错过的最后一批落库内容。
          try {
            const [conversation, messages] = await Promise.all([
              getDataService().getConversation(conversationId),
              getDataService().listMessages(conversationId),
            ]);
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
            }));
          } catch {
            // 续接失败不覆盖当前可见内容。
          }
        }
      })();
      resumeSessionInflight.set(conversationId, p);
      return p;
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
      // I11: 新会话首条响应标记进行中，用于在 / 页面显示停止按钮
      const isNewConversation = !input.conversationId;
      if (isNewConversation) set({ isStartingNew: true, startError: undefined });
      let conversationId = input.conversationId;
      if (conversationId) localOwnedStreams.add(conversationId);
      try {
        for await (const event of getDataService().sendMessage(input)) {
          if (event.type === "conversation-created") {
            conversationId = event.conversation.id;
            localOwnedStreams.add(conversationId);
            set((state) => ({
              sessions: {
                ...state.sessions,
                [conversationId!]: {
                  ...emptySession(conversationId!),
                  loaded: true,
                },
              },
              pendingRedirect: conversationId,
            }));
            continue;
          }
          if (!conversationId && event.type === "error") {
            set({ startError: event.message });
            continue;
          }
          if (conversationId) applyEvent(conversationId, event);
        }
      } finally {
        if (conversationId) localOwnedStreams.delete(conversationId);
        if (isNewConversation) set({ isStartingNew: false });
      }
    },

    stop: async (conversationId) => {
      await getDataService().stopGeneration(conversationId);
      // abort 后 fetch 会抛 AbortError，streamNdjson 静默吞掉，
      // done/error 事件不会到达，session 会永远卡在 streaming → 下次发送被守卫拒绝。
      // 这里主动把状态重置回 idle，并把进行中的消息标记为 stopped。
      // 新会话首条消息（conversationId 未知）由 send 的 finally 清 isStartingNew，无需处理。
      if (conversationId) {
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
        set({ startError: undefined });
      }
    },

    regenerate: async (conversationId, assistantMessageId, modelId) => {
      // I8: 并发守卫——同 send
      const s = get().sessions[conversationId];
      if (s?.status === "streaming") return;
      localOwnedStreams.add(conversationId);
      try {
        for await (const event of getDataService().regenerate(
          conversationId,
          assistantMessageId,
          modelId
        )) {
          applyEvent(conversationId, event);
        }
      } finally {
        localOwnedStreams.delete(conversationId);
      }
    },

    switchBranch: (conversationId, leafId) => {
      updateSession(conversationId, (s) => ({ ...s, currentLeafId: leafId }));
      void getDataService().updateConversation(conversationId, {
        currentLeafId: leafId,
      });
    },

    replaceMessageImage: async (conversationId, messageId, oldUrl, newUrl) => {
      updateSession(conversationId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                parts: m.parts.map((p) =>
                  p.type === "image" && p.url === oldUrl
                    ? { ...p, url: newUrl }
                    : p
                ),
              }
            : m
        ),
      }));
      try {
        await getDataService().replaceMessageImage(messageId, oldUrl, newUrl);
      } catch {
        updateSession(conversationId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  parts: m.parts.map((p) =>
                    p.type === "image" && p.url === newUrl
                      ? { ...p, url: oldUrl }
                      : p
                  ),
                }
              : m
          ),
        }));
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

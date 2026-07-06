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

export interface ChatSession {
  conversationId: string;
  messages: Message[];
  status: "idle" | "streaming";
  streamingMessageId?: string;
  loaded: boolean;
  /** 当前展示分支的叶子消息 */
  currentLeafId?: string;
}

interface ChatState {
  sessions: Record<string, ChatSession>;
  /** 新会话创建后待跳转的 id */
  pendingRedirect: string | null;
  ensureSession: (conversationId: string) => Promise<void>;
  send: (input: SendMessageInput) => Promise<void>;
  stop: (conversationId: string) => Promise<void>;
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

export const useChatStore = create<ChatState>((set, get) => {
  const updateSession = (
    conversationId: string,
    updater: (s: ChatSession) => ChatSession
  ) => {
    set((state) => {
      const session = state.sessions[conversationId] ?? emptySession(conversationId);
      return {
        sessions: { ...state.sessions, [conversationId]: updater(session) },
      };
    });
  };

  /** 把流式事件应用到会话状态 */
  const applyEvent = (conversationId: string, event: StreamEvent) => {
    switch (event.type) {
      case "user-message":
      case "assistant-start": {
        const message =
          event.type === "user-message" ? event.message : event.message;
        updateSession(conversationId, (s) => ({
          ...s,
          messages: [...s.messages, message],
          currentLeafId: message.id,
          ...(event.type === "assistant-start"
            ? { status: "streaming" as const, streamingMessageId: message.id }
            : {}),
        }));
        break;
      }
      case "reasoning-delta":
      case "text-delta": {
        const partType = event.type === "reasoning-delta" ? "reasoning" : "text";
        updateSession(conversationId, (s) => ({
          ...s,
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
          messages: s.messages.map((m) =>
            m.id === event.messageId
              ? { ...m, parts: [...m.parts, event.part] }
              : m
          ),
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
      case "done": {
        updateSession(conversationId, (s) => ({
          ...s,
          status: "idle",
          streamingMessageId: undefined,
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
          status: "idle",
          streamingMessageId: undefined,
        }));
        break;
      }
    }
  };

  return {
    sessions: {},
    pendingRedirect: null,

    clearRedirect: () => set({ pendingRedirect: null }),

    ensureSession: async (conversationId) => {
      const existing = get().sessions[conversationId];
      if (existing?.loaded) return;
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
          updateSession(conversationId, (s) => ({
            ...s,
            messages,
            loaded: true,
            currentLeafId:
              s.currentLeafId ??
              conversation?.currentLeafId ??
              messages[messages.length - 1]?.id,
          }));
        } finally {
          ensureSessionInflight.delete(conversationId);
        }
      })();
      ensureSessionInflight.set(conversationId, p);
      return p;
    },

    send: async (input) => {
      // I8: 并发守卫——同一会话已有流式进行时，拒绝新的 send/regenerate，
      // 防止两条流写同一 messageId 的 text-delta 造成竞态 corrupt。
      if (input.conversationId) {
        const s = get().sessions[input.conversationId];
        if (s?.status === "streaming") return;
      }
      let conversationId = input.conversationId;
      for await (const event of getDataService().sendMessage(input)) {
        if (event.type === "conversation-created") {
          conversationId = event.conversation.id;
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
        if (conversationId) applyEvent(conversationId, event);
      }
    },

    stop: async (conversationId) => {
      await getDataService().stopGeneration(conversationId);
    },

    regenerate: async (conversationId, assistantMessageId, modelId) => {
      // I8: 并发守卫——同 send
      const s = get().sessions[conversationId];
      if (s?.status === "streaming") return;
      for await (const event of getDataService().regenerate(
        conversationId,
        assistantMessageId,
        modelId
      )) {
        applyEvent(conversationId, event);
      }
    },

    switchBranch: (conversationId, leafId) => {
      updateSession(conversationId, (s) => ({ ...s, currentLeafId: leafId }));
      void getDataService().updateConversation(conversationId, {
        currentLeafId: leafId,
      });
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

// 聊天核心状态:会话消息树、乐观发送、流消费、分支切换、断流恢复
// 纯函数(消息树遍历 / 事件应用)在 ./chat-core,本文件只做状态管理与 IO

import { create } from "zustand";
import * as chatApi from "@/api/chat";
import type { SendMessageInput } from "@/api/chat";
import { patchConversation } from "@/api/conversations";
import { queryClient } from "@/lib/query-client";
import type { Message, StreamEvent } from "@/api/types";
import {
  applyEvent,
  deepestLeaf,
  siblingBranches,
  type ChatSession,
} from "./chat-core";

/** send() 的入参:客户端字段与树锚点由 store 预生成;parentId 可选(编辑重发开新分支时指定) */
export type SendPayload = Omit<
  SendMessageInput,
  | "conversationId"
  | "clientConversationId"
  | "clientGenerationId"
  | "clientUserMessageId"
  | "clientAssistantMessageId"
  | "parentId"
> & { parentId?: string };

export type FailedSendInput = SendMessageInput & { conversationId: string };

const MAX_SESSIONS = 20;

/** 非响应式的运行时状态(不进 zustand,避免无谓重渲染) */
const inFlightLoads = new Map<string, Promise<void>>();
const abortControllers = new Map<string, AbortController>();
/** 本标签页发起的流:ensureSession 遇到这些会话不重复 resume */
const localOwnedStreams = new Set<string>();
const lastUsedAt = new Map<string, number>();

interface ChatState {
  sessions: Record<string, ChatSession>;
  /** 新会话首帧(conversation-created)后待跳转的真实 conversationId */
  pendingRedirect: string | null;
  /** 发送失败的原始请求,供 retrySend 原样重发(幂等靠 clientGenerationId 不变) */
  failedSendInputs: Record<string, FailedSendInput>;

  ensureSession: (conversationId: string) => Promise<void>;
  send: (conversationId: string | null, input: SendPayload) => Promise<void>;
  retrySend: (conversationId: string) => Promise<void>;
  stop: (conversationId: string) => Promise<void>;
  regenerate: (
    conversationId: string,
    assistantMessageId: string,
    modelId?: string,
  ) => Promise<void>;
  switchBranch: (
    conversationId: string,
    messageId: string,
    direction: "prev" | "next",
  ) => Promise<void>;
  resume: (conversationId: string) => Promise<void>;
  setFeedback: (messageId: string, value: "up" | "down" | null) => Promise<void>;
  /** 局部重绘后替换消息图片 url(乐观更新,失败回滚并抛错) */
  replaceMessageImage: (
    messageId: string,
    oldUrl: string,
    newUrl: string,
    editPrompt?: string,
  ) => Promise<void>;
  /**
   * 合入后台产生的消息(如 skill run 完成回执):
   * session 存在且该 id 不存在才插入;不改变 currentLeafId(可见性由 visibleThread 的 receipt 逻辑处理)
   */
  upsertBackgroundMessage: (conversationId: string, message: Message) => void;
  /** 取出并清除 pendingRedirect(页面消费后跳转) */
  consumePendingRedirect: () => string | null;
}

function freshSession(conversationId: string): ChatSession {
  return { conversationId, messages: [], status: "idle", loaded: false };
}

/** 会话浅拷贝(消息与 part 复制一层,applyEvent 在副本上原地改) */
function copySession(s: ChatSession): ChatSession {
  return {
    ...s,
    messages: s.messages.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p })) })),
  };
}

/** session 数量上限 20:淘汰非 streaming 且已 loaded 的最久未用 */
function evictIfNeeded(sessions: Record<string, ChatSession>): Record<string, ChatSession> {
  const ids = Object.keys(sessions);
  if (ids.length <= MAX_SESSIONS) return sessions;
  const candidates = ids
    .filter((id) => sessions[id]!.status !== "streaming" && sessions[id]!.loaded)
    .sort((a, b) => (lastUsedAt.get(a) ?? 0) - (lastUsedAt.get(b) ?? 0));
  const next = { ...sessions };
  for (let i = 0; Object.keys(next).length > MAX_SESSIONS && i < candidates.length; i++) {
    delete next[candidates[i]!];
    lastUsedAt.delete(candidates[i]!);
  }
  return next;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "网络错误,请稍后重试";
}

export const useChatStore = create<ChatState>()((set, get) => {
  /** 在 session 副本上执行修改并提交(带 LRU 触碰与淘汰) */
  const update = (id: string, fn: (draft: ChatSession) => void): void => {
    set((s) => {
      const cur = s.sessions[id];
      if (!cur) return s;
      const draft = copySession(cur);
      fn(draft);
      lastUsedAt.set(id, Date.now());
      return { sessions: evictIfNeeded({ ...s.sessions, [id]: draft }) };
    });
  };

  const applyToSession = (conversationId: string, event: StreamEvent): void => {
    if (event.type === "conversation-created") {
      set({ pendingRedirect: event.conversation.id });
    }
    if (event.type === "title") {
      invalidateConversations();
    }
    if (event.type === "artifact") {
      // 阶段 4 的 artifact 面板据此刷新
      void queryClient.invalidateQueries({
        queryKey: ["artifacts", conversationId],
      });
    }
    update(conversationId, (draft) => applyEvent(draft, event));
  };

  const invalidateConversations = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  interface RunContext {
    assistantMessageId: string;
    /** 乐观 user 消息 id(仅普通发送有) */
    userMessageId?: string;
    /** 失败时存入 failedSendInputs 的原始 body */
    retryBody?: FailedSendInput;
  }

  /**
   * 统一流消费:成功 → invalidate 会话列表;失败 → 按 user 是否已被服务端接受
   * 分别走「保留消息 + assistant 标错」或「删占位 + user 标 failed 存重试」。
   */
  const runStream = async (
    conversationId: string,
    start: (signal: AbortSignal) => Promise<AsyncGenerator<StreamEvent>>,
    ctx: RunContext,
  ): Promise<void> => {
    const controller = new AbortController();
    abortControllers.set(conversationId, controller);
    localOwnedStreams.add(conversationId);
    let userAccepted = false;
    let failed: string | null = null;
    try {
      const events = await start(controller.signal);
      for await (const event of events) {
        if (event.type === "user-message") userAccepted = true;
        if (event.type === "error") failed = event.message;
        applyToSession(conversationId, event);
      }
      if (!failed) invalidateConversations();
    } catch (err) {
      if (controller.signal.aborted) return; // stop() 已就地处理
      failed = errorMessage(err);
    } finally {
      abortControllers.delete(conversationId);
      localOwnedStreams.delete(conversationId);
    }

    if (failed) {
      handleFailure(conversationId, failed, ctx, userAccepted || !ctx.userMessageId);
    }
    // 保底:流异常中断(没收到 done)时把会话状态拉回 idle
    update(conversationId, (s) => {
      if (s.status === "streaming" && !abortControllers.has(conversationId)) {
        s.status = "idle";
        s.streamingMessageId = undefined;
      }
    });
  };

  const handleFailure = (
    conversationId: string,
    message: string,
    ctx: RunContext,
    keepMessages: boolean,
  ): void => {
    if (keepMessages) {
      // user 已被服务端接受(或 regenerate):保留全部消息,assistant 标 error
      update(conversationId, (s) => {
        s.streamError = message;
        s.status = "idle";
        s.streamingMessageId = undefined;
        const assistant = s.messages.find((m) => m.id === ctx.assistantMessageId);
        if (assistant) {
          assistant.status = "error";
          assistant.parts.push({ type: "text", text: `⚠️ ${message}` });
        }
      });
      return;
    }
    // user 未被接受:删 assistant 占位,user 标 failed 并存原始请求供重试
    update(conversationId, (s) => {
      s.streamError = message;
      s.status = "idle";
      s.streamingMessageId = undefined;
      s.messages = s.messages.filter((m) => m.id !== ctx.assistantMessageId);
      const user = s.messages.find((m) => m.id === ctx.userMessageId);
      if (user) {
        user.deliveryState = "failed";
        user.deliveryError = message;
      }
      if (ctx.userMessageId) s.currentLeafId = ctx.userMessageId;
    });
    if (ctx.retryBody) {
      set((s) => ({
        failedSendInputs: { ...s.failedSendInputs, [conversationId]: ctx.retryBody! },
      }));
    }
  };

  return {
    sessions: {},
    pendingRedirect: null,
    failedSendInputs: {},

    ensureSession: (conversationId) => {
      const existing = get().sessions[conversationId];
      if (existing?.loaded) {
        lastUsedAt.set(conversationId, Date.now());
        return Promise.resolve();
      }
      const inFlight = inFlightLoads.get(conversationId);
      if (inFlight) return inFlight;

      // 先放壳,UI 立即可显示加载态
      if (!existing) {
        set((s) => ({
          sessions: { ...s.sessions, [conversationId]: freshSession(conversationId) },
        }));
      }

      const promise = (async () => {
        try {
          const { conversation, messages } =
            await chatApi.getConversationWithMessages(conversationId);
          const streamingMsg = messages.find(
            (m) => m.role === "assistant" && m.status === "streaming",
          );
          update(conversationId, (s) => {
            s.messages = messages;
            s.loaded = true;
            s.loadError = undefined;
            s.currentLeafId = conversation.currentLeafId ?? deepestLeaf(messages);
            if (streamingMsg) {
              s.status = "streaming";
              s.streamingMessageId = streamingMsg.id;
            } else {
              s.status = "idle";
              s.streamingMessageId = undefined;
            }
          });
          // 有进行中的生成且不是本标签页发起的:自动订阅续传
          if (
            streamingMsg &&
            !localOwnedStreams.has(conversationId) &&
            !abortControllers.has(conversationId)
          ) {
            void get().resume(conversationId);
          }
        } catch (err) {
          update(conversationId, (s) => {
            s.loadError = errorMessage(err);
          });
        } finally {
          inFlightLoads.delete(conversationId);
        }
      })();
      inFlightLoads.set(conversationId, promise);
      return promise;
    },

    send: async (conversationId, input) => {
      const isNew = !conversationId;
      const convId = conversationId ?? chatApi.clientId("c");
      const session = get().sessions[convId];
      if (session?.status === "streaming") return; // 并发守卫

      const userMessageId = chatApi.clientId("msg");
      const assistantMessageId = chatApi.clientId("msg");
      const parentId =
        input.parentId ??
        (session
          ? (session.currentLeafId ?? deepestLeaf(session.messages))
          : undefined);
      const now = new Date().toISOString();

      const userMessage: Message = {
        id: userMessageId,
        conversationId: convId,
        parentId: parentId ?? null,
        role: "user",
        parts: [
          ...(input.images ?? []),
          ...(input.attachments ?? []),
          { type: "text", text: input.text },
          { type: "tool-config", tools: input.tools },
        ],
        createdAt: now,
        status: "complete",
        deliveryState: "sending",
      };
      const assistantPlaceholder: Message = {
        id: assistantMessageId,
        conversationId: convId,
        parentId: userMessageId,
        role: "assistant",
        parts: [],
        modelId: input.modelId,
        createdAt: now,
        status: "streaming",
      };

      update(convId, (s) => {
        s.messages.push(userMessage, assistantPlaceholder);
        s.currentLeafId = assistantMessageId;
        s.status = "streaming";
        s.streamingMessageId = assistantMessageId;
        s.streamError = undefined;
        s.loaded = true;
      });

      const body: SendMessageInput = {
        ...input,
        // 已有会话用真实 id;新会话省略 conversationId,仅带 clientConversationId
        conversationId: conversationId ?? undefined,
        clientConversationId: isNew ? convId : undefined,
        clientUserMessageId: userMessageId,
        clientAssistantMessageId: assistantMessageId,
        clientGenerationId: chatApi.clientId("cg"),
        parentId,
      };
      // failedSendInputs 的值按契约要求带 conversationId;
      // 新会话此处等于 clientConversationId(会话尚未在服务端创建)
      const retryBody: FailedSendInput = { ...body, conversationId: convId };

      await runStream(convId, (signal) => chatApi.sendMessage(body, signal), {
        userMessageId,
        assistantMessageId,
        retryBody,
      });
    },

    retrySend: async (conversationId) => {
      const stored = get().failedSendInputs[conversationId];
      if (!stored) return;
      const session = get().sessions[conversationId];
      if (session?.status === "streaming") return;

      const userMessageId = stored.clientUserMessageId!;
      // 幂等:复用同一 clientAssistantMessageId / clientGenerationId 原样重发
      const assistantMessageId = stored.clientAssistantMessageId!;
      set((s) => {
        const next = { ...s.failedSendInputs };
        delete next[conversationId];
        return { failedSendInputs: next };
      });
      update(conversationId, (s) => {
        const user = s.messages.find((m) => m.id === userMessageId);
        if (user) {
          user.deliveryState = "sending";
          user.deliveryError = undefined;
        }
        s.messages = s.messages.filter((m) => m.id !== assistantMessageId);
        s.messages.push({
          id: assistantMessageId,
          conversationId,
          parentId: userMessageId,
          role: "assistant",
          parts: [],
          modelId: stored.modelId,
          createdAt: new Date().toISOString(),
          status: "streaming",
        });
        s.currentLeafId = assistantMessageId;
        s.status = "streaming";
        s.streamingMessageId = assistantMessageId;
        s.streamError = undefined;
      });

      await runStream(conversationId, (signal) => chatApi.sendMessage(stored, signal), {
        userMessageId,
        assistantMessageId,
        retryBody: stored,
      });
    },

    stop: async (conversationId) => {
      abortControllers.get(conversationId)?.abort();
      update(conversationId, (s) => {
        if (s.streamingMessageId) {
          const msg = s.messages.find((m) => m.id === s.streamingMessageId);
          if (msg && msg.status === "streaming") msg.status = "stopped";
        }
        s.status = "idle";
        s.streamingMessageId = undefined;
      });
      // 服务端不会再发 done;本地状态已就地收口
      await chatApi.stopGeneration(conversationId).catch(() => undefined);
    },

    regenerate: async (conversationId, assistantMessageId, modelId) => {
      const session = get().sessions[conversationId];
      if (!session || session.status === "streaming") return;
      const target = session.messages.find((m) => m.id === assistantMessageId);
      if (!target) return;

      const newAssistantId = chatApi.clientId("msg");
      update(conversationId, (s) => {
        s.messages.push({
          id: newAssistantId,
          conversationId,
          parentId: target.parentId,
          role: "assistant",
          parts: [],
          modelId: modelId ?? target.modelId,
          createdAt: new Date().toISOString(),
          status: "streaming",
        });
        s.currentLeafId = newAssistantId;
        s.status = "streaming";
        s.streamingMessageId = newAssistantId;
        s.streamError = undefined;
      });

      await runStream(
        conversationId,
        (signal) =>
          chatApi.regenerate(
            {
              regenerate: true,
              clientGenerationId: chatApi.clientId("cg"),
              clientAssistantMessageId: newAssistantId,
              conversationId,
              assistantMessageId,
              modelId,
            },
            signal,
          ),
        { assistantMessageId: newAssistantId },
      );
    },

    switchBranch: async (conversationId, messageId, direction) => {
      const session = get().sessions[conversationId];
      if (!session) return;
      const siblings = siblingBranches(session.messages, messageId);
      const index = siblings.findIndex((m) => m.id === messageId);
      const target = siblings[direction === "prev" ? index - 1 : index + 1];
      if (!target) return;

      const newLeaf = deepestLeaf(session.messages, target.id) ?? target.id;
      const prevLeaf = session.currentLeafId;
      update(conversationId, (s) => {
        s.currentLeafId = newLeaf;
      });
      try {
        await patchConversation(conversationId, { currentLeafId: newLeaf });
      } catch {
        // 回滚本地切换
        update(conversationId, (s) => {
          s.currentLeafId = prevLeaf;
        });
      }
    },

    resume: async (conversationId) => {
      if (abortControllers.has(conversationId)) return; // 已有流在消费
      const controller = new AbortController();
      abortControllers.set(conversationId, controller);
      try {
        const events = await chatApi.resumeStream(conversationId, controller.signal);
        for await (const event of events) {
          applyToSession(conversationId, event);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          update(conversationId, (s) => {
            s.streamError = errorMessage(err);
          });
        }
      } finally {
        abortControllers.delete(conversationId);
      }
      // 流结束后全量重拉兜底(事件可能与本地乐观状态有偏差)
      try {
        const { conversation, messages } =
          await chatApi.getConversationWithMessages(conversationId);
        update(conversationId, (s) => {
          s.messages = messages;
          s.loaded = true;
          s.status = "idle";
          s.streamingMessageId = undefined;
          s.currentLeafId = conversation.currentLeafId ?? deepestLeaf(messages);
        });
        invalidateConversations();
      } catch {
        // 兜底失败保持现状,下次进入会话会重新加载
      }
    },

    setFeedback: async (messageId, value) => {
      const session = Object.values(get().sessions).find((s) =>
        s.messages.some((m) => m.id === messageId),
      );
      if (!session) return;
      const previous = session.messages.find((m) => m.id === messageId)?.feedback;
      update(session.conversationId, (s) => {
        const msg = s.messages.find((m) => m.id === messageId);
        if (msg) msg.feedback = value ?? undefined;
      });
      try {
        await chatApi.setFeedback(messageId, value);
      } catch {
        update(session.conversationId, (s) => {
          const msg = s.messages.find((m) => m.id === messageId);
          if (msg) msg.feedback = previous;
        });
      }
    },

    replaceMessageImage: async (messageId, oldUrl, newUrl, editPrompt) => {
      const session = Object.values(get().sessions).find((s) =>
        s.messages.some((m) => m.id === messageId),
      );
      if (!session) return;
      const convId = session.conversationId;
      // 乐观替换该消息中 url 匹配的 image part
      update(convId, (s) => {
        const msg = s.messages.find((m) => m.id === messageId);
        const part = msg?.parts.find((p) => p.type === "image" && p.url === oldUrl);
        if (part && part.type === "image") part.url = newUrl;
      });
      try {
        await chatApi.updateMessageImage(messageId, { oldUrl, newUrl, editPrompt });
      } catch (err) {
        // 回滚并抛给调用方提示
        update(convId, (s) => {
          const msg = s.messages.find((m) => m.id === messageId);
          const part = msg?.parts.find(
            (p) => p.type === "image" && p.url === newUrl,
          );
          if (part && part.type === "image") part.url = oldUrl;
        });
        throw err;
      }
    },

    consumePendingRedirect: () => {
      const id = get().pendingRedirect;
      if (id) set({ pendingRedirect: null });
      return id;
    },

    upsertBackgroundMessage: (conversationId, message) => {
      update(conversationId, (s) => {
        if (!s.messages.some((m) => m.id === message.id)) {
          s.messages.push(message);
        }
      });
      // 回执可能伴随 artifact 产出,顺手刷新
      void queryClient.invalidateQueries({
        queryKey: ["artifacts", conversationId],
      });
    },
  };
});

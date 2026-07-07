import { NextRequest } from "next/server";
import { eq, and, or, isNull, sql, desc } from "drizzle-orm";
import {
  generateText,
  stepCountIs,
  streamText,
  type ModelMessage,
  type ToolSet,
} from "ai";
import type { JSONObject } from "@ai-sdk/provider";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";
import { computeCostCents, resolveModel } from "@/lib/server/llm/registry";
import {
  assertCanSpend,
  assertModelAccess,
  recordUsage,
} from "@/lib/server/billing";
import { rateLimit } from "@/lib/server/rate-limit";
import { toUiArtifact } from "@/app/api/artifacts/util";
import { resolveImageSource } from "@/lib/server/llm/image-source";
import {
  buildArtifactTools,
  buildCodeTools,
  buildImageTools,
  buildKnowledgeTool,
  buildMcpTools,
  buildMemoryTools,
  buildVisionTool,
  buildWebTools,
  loadRecentMemories,
} from "@/lib/server/llm/tools";
import type {
  ChatToolToggles,
  ImagePart,
  Message as UiMessage,
  MessagePart,
  SendMessageInput,
  StreamEvent,
  ToolCallPart,
  ToolResultSummary,
} from "@/lib/types";

export const maxDuration = 300;

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
const RESUME_POLL_MS = 750;
const RESUME_STALE_MS = 120_000;
const STREAM_HEARTBEAT_MS = 15_000;

interface RegenerateInput {
  regenerate: true;
  clientGenerationId?: string;
  conversationId: string;
  assistantMessageId: string;
  modelId?: string;
}

type ChatRequest = SendMessageInput | RegenerateInput;

type ChatEmit = (event: StreamEvent) => void;

interface PreparedGeneration {
  conversationId: string;
  assistantId: string;
  clientGenerationId?: string;
  bootstrapEvents: StreamEvent[];
  cleanupCanceledBeforeStart?: () => Promise<void>;
  run: (emit: ChatEmit, signal: AbortSignal) => Promise<void>;
}

interface ChatSubscriber {
  emit: ChatEmit;
  close: () => void;
}

interface ChatGenerationTask {
  conversationId: string;
  clientGenerationId?: string;
  userId: string;
  assistantMessageId: string;
  abortController: AbortController;
  canceledBeforeStart: boolean;
  assistantStarted: boolean;
  bootstrapPublished: boolean;
  events: StreamEvent[];
  subscribers: Set<ChatSubscriber>;
  done: boolean;
  startedAt: number;
  promise?: Promise<void>;
}

const globalChatState = globalThis as typeof globalThis & {
  __linhubChatTasks?: Map<string, ChatGenerationTask>;
  __linhubChatTasksByClientId?: Map<string, ChatGenerationTask>;
  __linhubCanceledClientIds?: Set<string>;
  __linhubPendingGenerationKeys?: Map<string, { userId: string; startedAt: number }>;
};

const chatTasks = (globalChatState.__linhubChatTasks ??= new Map());
const chatTasksByClientId = (globalChatState.__linhubChatTasksByClientId ??= new Map());
const canceledClientIds = (globalChatState.__linhubCanceledClientIds ??= new Set());
const pendingGenerationKeys = (globalChatState.__linhubPendingGenerationKeys ??= new Map());
const PENDING_GENERATION_STALE_MS = 300_000;

class ChatBusyError extends Error {
  constructor() {
    super("当前会话正在生成，请稍后再试");
    this.name = "ChatBusyError";
  }
}

function isLiveTask(task: ChatGenerationTask | undefined, userId?: string) {
  return (
    !!task &&
    !task.done &&
    !task.abortController.signal.aborted &&
    (!userId || task.userId === userId)
  );
}

function clientGenerationKey(userId: string, clientGenerationId: string) {
  return `${userId}:${clientGenerationId}`;
}

function requestedConversationId(body: ChatRequest) {
  return "regenerate" in body ? body.conversationId : body.conversationId;
}

function requestedClientGenerationId(body: ChatRequest) {
  return "regenerate" in body ? body.clientGenerationId : body.clientGenerationId;
}

function pruneStalePendingGenerationKeys() {
  const now = Date.now();
  for (const [key, value] of pendingGenerationKeys) {
    if (now - value.startedAt > PENDING_GENERATION_STALE_MS) {
      pendingGenerationKeys.delete(key);
    }
  }
}

async function reserveGenerationSlot(
  body: ChatRequest,
  userId: string
): Promise<() => void> {
  pruneStalePendingGenerationKeys();

  const keys: string[] = [];
  const conversationId = requestedConversationId(body);
  if (conversationId) {
    const [conversation] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.ownerId, userId)
        )
      )
      .limit(1);
    if (!conversation) throw new Error("会话不存在");

    const task = chatTasks.get(conversationId);
    if (isLiveTask(task, userId)) throw new ChatBusyError();
    keys.push(`conversation:${conversationId}`);
  }

  const clientGenerationId = requestedClientGenerationId(body);
  if (clientGenerationId) {
    const task = chatTasksByClientId.get(
      clientGenerationKey(userId, clientGenerationId)
    );
    if (isLiveTask(task, userId)) throw new ChatBusyError();
    keys.push(`client:${clientGenerationKey(userId, clientGenerationId)}`);
  }

  const busy = keys.some((key) => pendingGenerationKeys.get(key)?.userId === userId);
  if (busy) throw new ChatBusyError();

  const reservation = { userId, startedAt: Date.now() };
  for (const key of keys) pendingGenerationKeys.set(key, reservation);

  return () => {
    for (const key of keys) {
      if (pendingGenerationKeys.get(key) === reservation) {
        pendingGenerationKeys.delete(key);
      }
    }
  };
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const limited = rateLimit(`chat:${userId}`, 20, 60_000);
  if (limited) return limited;
  const body = (await req.json()) as ChatRequest;

  let prepared: PreparedGeneration;
  let releaseGenerationSlot: (() => void) | undefined;
  try {
    releaseGenerationSlot = await reserveGenerationSlot(body, userId);
    prepared =
      "regenerate" in body
        ? await prepareRegenerate(body, userId)
        : await prepareSend(body, userId);
  } catch (e) {
    releaseGenerationSlot?.();
    return Response.json(
      { error: e instanceof Error ? e.message : "生成失败" },
      { status: e instanceof ChatBusyError ? 409 : 400 }
    );
  }

  try {
    const task = startGenerationTask(prepared, userId);
    releaseGenerationSlot?.();
    releaseGenerationSlot = undefined;
    return createTaskStreamResponse(task, req.signal, {
      replayBufferedEvents: true,
      syncAssistantSnapshot: false,
    });
  } catch (e) {
    releaseGenerationSlot?.();
    return Response.json(
      { error: e instanceof Error ? e.message : "生成失败" },
      { status: 409 }
    );
  }
}

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return Response.json({ error: "缺少 conversationId" }, { status: 400 });
  }
  const [conversation] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.ownerId, session.user.id)
      )
    )
    .limit(1);
  if (!conversation) return Response.json({ error: "not found" }, { status: 404 });

  const task = chatTasks.get(conversationId);
  if (isLiveTask(task, session.user.id)) {
    return createTaskStreamResponse(task, req.signal, {
      replayBufferedEvents: false,
      syncAssistantSnapshot: true,
    });
  }

  const snapshot = await loadLatestStreamingAssistantSnapshot(conversationId);
  if (!snapshot) return createEmptyStreamResponse();

  const followOptions = readDbFollowOptions(req);
  return createDbFollowStreamResponse(conversationId, snapshot.id, req.signal, {
    initialSnapshot: snapshot,
    pollMs: followOptions.pollMs,
    staleMs: followOptions.staleMs,
  });
}

export async function DELETE(req: NextRequest) {
  await ensureSeeded();
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const clientGenerationId = req.nextUrl.searchParams.get("clientGenerationId");
  if (!conversationId && !clientGenerationId) {
    return Response.json({ error: "缺少 conversationId" }, { status: 400 });
  }
  const task = conversationId
    ? chatTasks.get(conversationId)
    : clientGenerationId
      ? chatTasksByClientId.get(
          clientGenerationKey(session.user.id, clientGenerationId)
        )
      : undefined;
  if (isLiveTask(task, session.user.id)) {
    task.abortController.abort();
    if (!task.assistantStarted) task.canceledBeforeStart = true;
    // 不在这里用 DB 里的 streaming 行抢先广播 stopped：DB 部分落库有 750ms
    // 节流，可能比已经发给浏览器的 token 更旧。显式停止只 abort 后台生成，
    // 让 streamAssistant 在 finally 用内存里的最新 parts 持久化并广播最终
    // assistant-snapshot/done。这样其他标签页不会在停止瞬间回滚到半截快照。
  } else if (conversationId) {
    const [conversation] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.ownerId, session.user.id)
        )
      )
      .limit(1);
    if (!conversation) return Response.json({ error: "not found" }, { status: 404 });
    await stopStreamingAssistants(conversationId);
  } else if (clientGenerationId) {
    const key = clientGenerationKey(session.user.id, clientGenerationId);
    canceledClientIds.add(key);
    setTimeout(() => canceledClientIds.delete(key), 60_000);
  }
  return Response.json({ ok: true });
}

function startGenerationTask(
  prepared: PreparedGeneration,
  userId: string
): ChatGenerationTask {
  const existing = chatTasks.get(prepared.conversationId);
  if (isLiveTask(existing, userId)) {
    throw new Error("当前会话正在生成，请稍后再试");
  }

  const task: ChatGenerationTask = {
    conversationId: prepared.conversationId,
    clientGenerationId: prepared.clientGenerationId,
    userId,
    assistantMessageId: prepared.assistantId,
    abortController: new AbortController(),
    canceledBeforeStart: false,
    assistantStarted: false,
    bootstrapPublished: false,
    events: [],
    subscribers: new Set(),
    done: false,
    startedAt: Date.now(),
  };
  chatTasks.set(prepared.conversationId, task);
  if (prepared.clientGenerationId) {
    const key = clientGenerationKey(userId, prepared.clientGenerationId);
    chatTasksByClientId.set(key, task);
    if (canceledClientIds.delete(key)) {
      task.canceledBeforeStart = true;
      task.abortController.abort();
    }
  }

  const emit: ChatEmit = (event) => publishTaskEvent(task, event);
  let cleanupCanceledBeforeStartPromise: Promise<void> | undefined;
  const cleanupCanceledBeforeStart = () => {
    cleanupCanceledBeforeStartPromise ??=
      prepared.cleanupCanceledBeforeStart?.() ?? Promise.resolve();
    return cleanupCanceledBeforeStartPromise;
  };
  if (!task.canceledBeforeStart) {
    for (const event of prepared.bootstrapEvents) emit(event);
    task.bootstrapPublished = true;
  }

  task.promise = (async () => {
    try {
      if (task.canceledBeforeStart) {
        if (!task.bootstrapPublished) {
          await cleanupCanceledBeforeStart();
        }
      } else {
        await prepared.run(emit, task.abortController.signal);
      }
    } catch (e) {
      emit({
        type: "error",
        message: e instanceof Error ? e.message : "生成失败",
      });
    } finally {
      if (
        task.canceledBeforeStart &&
        !task.assistantStarted &&
        !task.bootstrapPublished
      ) {
        await cleanupCanceledBeforeStart();
      }
      task.done = true;
      for (const subscriber of [...task.subscribers]) subscriber.close();
      task.subscribers.clear();
      setTimeout(() => {
        if (chatTasks.get(task.conversationId) === task) {
          chatTasks.delete(task.conversationId);
        }
        if (
          task.clientGenerationId &&
          chatTasksByClientId.get(
            clientGenerationKey(task.userId, task.clientGenerationId)
          ) === task
        ) {
          chatTasksByClientId.delete(
            clientGenerationKey(task.userId, task.clientGenerationId)
          );
        }
      }, 60_000);
    }
  })();

  return task;
}

function publishTaskEvent(task: ChatGenerationTask, event: StreamEvent) {
  if (
    event.type === "assistant-start" &&
    event.message.id === task.assistantMessageId
  ) {
    task.assistantStarted = true;
  }
  task.events.push(event);
  for (const subscriber of [...task.subscribers]) {
    subscriber.emit(event);
  }
}

function createEmptyStreamResponse() {
  return new Response("", {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function createTaskStreamResponse(
  task: ChatGenerationTask,
  signal: AbortSignal,
  options: {
    replayBufferedEvents: boolean;
    syncAssistantSnapshot: boolean;
  }
) {
  const encoder = new TextEncoder();
  let streamClosed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let currentSubscriber: ChatSubscriber | undefined;
  let currentOnAbort: (() => void) | undefined;
  const stopHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };
  const stream = new ReadableStream({
    async start(controller) {
      const emitDirect = (event: StreamEvent) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          streamClosed = true;
          stopHeartbeat();
        }
      };
      let bufferingSubscriberEvents =
        options.syncAssistantSnapshot || options.replayBufferedEvents;
      let pendingSubscriberClose = false;
      const bufferedSubscriberEvents: StreamEvent[] = [];
      const subscriberEmit = (event: StreamEvent) => {
        if (bufferingSubscriberEvents) {
          bufferedSubscriberEvents.push(event);
          return;
        }
        emitDirect(event);
      };
      const close = () => {
        if (streamClosed) return;
        streamClosed = true;
        stopHeartbeat();
        if (currentOnAbort) signal.removeEventListener("abort", currentOnAbort);
        if (currentSubscriber) task.subscribers.delete(currentSubscriber);
        try {
          controller.close();
        } catch {
          // 客户端已取消读取时 controller 可能已经关闭。
        }
      };
      const onAbort = () => {
        close();
      };
      const subscriber: ChatSubscriber = {
        emit: subscriberEmit,
        close: () => {
          if (bufferingSubscriberEvents) {
            pendingSubscriberClose = true;
            return;
          }
          close();
        },
      };
      currentSubscriber = subscriber;
      currentOnAbort = onAbort;
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        close();
        return;
      }
      // I13: 心跳——长 reasoning/tool 期间每 15s 发一次 ping，
      // 防止 CDN/代理（通常 60-100s 空闲超时）静默断流。客户端 applyEvent 忽略。
      heartbeat = setInterval(() => emitDirect({ type: "ping" }), STREAM_HEARTBEAT_MS);
      try {
        if (!task.done) task.subscribers.add(subscriber);
        const replayEvents = options.replayBufferedEvents ? [...task.events] : [];
        const replayedEvents = new Set(replayEvents);
        let observedSnapshotEvents = new Set<StreamEvent>();
        let snapshotReplayEvents: StreamEvent[] = [];
        if (options.syncAssistantSnapshot) {
          const snapshot = await loadAssistantSnapshot(task);
          const snapshotEvents = [...task.events];
          observedSnapshotEvents = new Set(snapshotEvents);
          if (snapshot) {
            snapshotReplayEvents = eventsAfterAssistantSnapshot(
              task,
              snapshot,
              snapshotEvents
            );
            emitDirect({ type: "assistant-snapshot", message: snapshot });
          } else {
            // assistant 行还没落库时，退回到内存事件回放，避免跨标签页空白等待。
            snapshotReplayEvents = snapshotEvents.filter((event) =>
              shouldReplayWithoutSnapshot(event)
            );
          }
        }
        for (const event of replayEvents) emitDirect(event);
        for (const event of snapshotReplayEvents) emitDirect(event);
        bufferingSubscriberEvents = false;
        for (const event of bufferedSubscriberEvents) {
          if (replayedEvents.has(event) || observedSnapshotEvents.has(event)) continue;
          if (
            options.syncAssistantSnapshot &&
            !shouldReplayLiveEventAfterSnapshot(task, event)
          ) {
            continue;
          }
          emitDirect(event);
        }
        bufferedSubscriberEvents.length = 0;
        if (task.done) {
          close();
          return;
        }
        if (pendingSubscriberClose) close();
      } catch (e) {
        emitDirect({
          type: "error",
          message: e instanceof Error ? e.message : "生成失败",
        });
        close();
      }
    },
    cancel() {
      streamClosed = true;
      stopHeartbeat();
      if (currentOnAbort) signal.removeEventListener("abort", currentOnAbort);
      if (currentSubscriber) task.subscribers.delete(currentSubscriber);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function eventsAfterAssistantSnapshot(
  task: ChatGenerationTask,
  snapshot: UiMessage,
  events: StreamEvent[]
) {
  const projection: {
    parts: MessagePart[];
    status: UiMessage["status"];
    usage?: UiMessage["usage"];
  } = {
    parts: [],
    status: "streaming",
  };
  let coveredUntil = 0;

  events.forEach((event, index) => {
    const relevant = applyAssistantProjection(
      projection,
      task.assistantMessageId,
      event
    );
    if (!relevant) {
      if (snapshotCoversProjection(snapshot, projection)) coveredUntil = index + 1;
      return;
    }
    if (snapshotCoversProjection(snapshot, projection)) coveredUntil = index + 1;
  });

  return events
    .slice(coveredUntil)
    .filter((event) => shouldReplayLiveEventAfterSnapshot(task, event));
}

function applyAssistantProjection(
  projection: {
    parts: MessagePart[];
    status: UiMessage["status"];
    usage?: UiMessage["usage"];
  },
  assistantId: string,
  event: StreamEvent
) {
  switch (event.type) {
    case "assistant-start":
      if (event.message.id !== assistantId) return false;
      projection.parts = cloneMessageParts(event.message.parts);
      projection.status = event.message.status;
      projection.usage = event.message.usage;
      return true;
    case "assistant-snapshot":
      if (event.message.id !== assistantId) return false;
      projection.parts = cloneMessageParts(event.message.parts);
      projection.status = event.message.status;
      projection.usage = event.message.usage;
      return true;
    case "reasoning-delta":
    case "text-delta":
      if (event.messageId !== assistantId) return false;
      appendDelta(
        projection.parts,
        event.type === "reasoning-delta" ? "reasoning" : "text",
        event.delta
      );
      return true;
    case "reasoning-done": {
      if (event.messageId !== assistantId) return false;
      const last = projection.parts[projection.parts.length - 1];
      if (last?.type === "reasoning") last.durationMs = event.durationMs;
      return true;
    }
    case "tool-call-start":
    case "tool-call-end":
      if (event.messageId !== assistantId) return false;
      upsertToolPart(projection.parts, event.part);
      return true;
    case "tool-input-delta":
      if (event.messageId !== assistantId) return false;
      projection.parts = projection.parts.map((part) =>
        part.type === "tool-call" && part.toolCallId === event.toolCallId
          ? { ...part, inputPreview: (part.inputPreview ?? "") + event.delta }
          : part
      );
      return true;
    case "image":
      if (event.messageId !== assistantId) return false;
      projection.parts.push({ ...event.part });
      return true;
    case "done":
      if (event.messageId !== assistantId) return false;
      projection.status = event.status;
      projection.usage = event.usage;
      return true;
    case "error":
      if (!event.messageId || event.messageId !== assistantId) return false;
      projection.status = "error";
      return true;
    default:
      return false;
  }
}

function upsertToolPart(parts: MessagePart[], part: ToolCallPart) {
  const index = parts.findIndex(
    (p) => p.type === "tool-call" && p.toolCallId === part.toolCallId
  );
  const cloned = cloneMessageParts([part])[0] as ToolCallPart;
  if (index === -1) {
    parts.push(cloned);
  } else {
    parts[index] = cloned;
  }
}

function snapshotCoversProjection(
  snapshot: UiMessage,
  projection: {
    parts: MessagePart[];
    status: UiMessage["status"];
    usage?: UiMessage["usage"];
  }
) {
  if (!partsCoverPrefix(snapshot.parts, projection.parts)) return false;
  if (projection.status !== "streaming" && snapshot.status !== projection.status) {
    return false;
  }
  return true;
}

function partsCoverPrefix(snapshotParts: MessagePart[], projectedParts: MessagePart[]) {
  if (projectedParts.length > snapshotParts.length) return false;
  for (let i = 0; i < projectedParts.length; i += 1) {
    if (!partCovers(snapshotParts[i], projectedParts[i])) return false;
  }
  return true;
}

function partCovers(snapshotPart: MessagePart | undefined, projectedPart: MessagePart) {
  if (!snapshotPart || snapshotPart.type !== projectedPart.type) return false;
  if (projectedPart.type === "text") {
    if (snapshotPart.type !== "text") return false;
    if (!snapshotPart.text.startsWith(projectedPart.text)) return false;
    return true;
  }
  if (projectedPart.type === "reasoning") {
    if (snapshotPart.type !== "reasoning") return false;
    if (!snapshotPart.text.startsWith(projectedPart.text)) return false;
    if (
      projectedPart.durationMs !== undefined &&
      snapshotPart.durationMs !== projectedPart.durationMs
    ) {
      return false;
    }
    return true;
  }
  if (projectedPart.type === "tool-call") {
    if (snapshotPart.type !== "tool-call") return false;
    if (
      snapshotPart.toolCallId !== projectedPart.toolCallId ||
      snapshotPart.toolName !== projectedPart.toolName
    ) {
      return false;
    }
    if (
      projectedPart.state !== "running" &&
      snapshotPart.state !== projectedPart.state
    ) {
      return false;
    }
    if (
      projectedPart.inputPreview &&
      !toolInputPreviewCovers(snapshotPart, projectedPart.inputPreview)
    ) {
      return false;
    }
    if (projectedPart.result && !snapshotPart.result) return false;
    return true;
  }
  if (projectedPart.type === "image") {
    return snapshotPart.type === "image" && snapshotPart.url === projectedPart.url;
  }
  if (projectedPart.type === "file") {
    return (
      snapshotPart.type === "file" &&
      snapshotPart.attachmentId === projectedPart.attachmentId
    );
  }
  if (projectedPart.type === "tool-config") {
    return snapshotPart.type === "tool-config";
  }
  return false;
}

function toolInputPreviewCovers(snapshotPart: ToolCallPart, preview: string) {
  if (snapshotPart.inputPreview !== undefined) {
    return snapshotPart.inputPreview.startsWith(preview);
  }
  // 参数已经结构化完成时，inputPreview 会被清空，此时 args 可视为覆盖了预览。
  return Object.keys(snapshotPart.args).length > 0;
}

function shouldReplayWithoutSnapshot(event: StreamEvent) {
  return event.type !== "conversation-created" && event.type !== "ping";
}

function shouldReplayLiveEventAfterSnapshot(
  task: ChatGenerationTask,
  event: StreamEvent
) {
  switch (event.type) {
    case "reasoning-delta":
    case "reasoning-done":
    case "text-delta":
    case "tool-call-start":
    case "tool-call-end":
    case "tool-input-start":
    case "tool-input-delta":
    case "image":
    case "artifact":
      return event.messageId === task.assistantMessageId;
    case "done":
      return event.messageId === task.assistantMessageId;
    case "error":
      return !event.messageId || event.messageId === task.assistantMessageId;
    case "ping":
      return true;
    default:
      return false;
  }
}

async function loadAssistantSnapshot(
  task: ChatGenerationTask
): Promise<UiMessage | null> {
  return loadAssistantMessageSnapshot(task.conversationId, task.assistantMessageId);
}

async function loadAssistantMessageSnapshot(
  conversationId: string,
  messageId: string
): Promise<UiMessage | null> {
  const [message] = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.id, messageId),
        eq(schema.messages.conversationId, conversationId)
      )
    )
    .limit(1);
  return message ? toUiMessage(message) : null;
}

async function loadLatestStreamingAssistantSnapshot(
  conversationId: string
): Promise<UiMessage | null> {
  const [message] = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.role, "assistant"),
        eq(schema.messages.status, "streaming")
      )
    )
    .orderBy(desc(schema.messages.createdAt))
    .limit(1);
  return message ? toUiMessage(message) : null;
}

function messageSnapshotKey(message: UiMessage) {
  return JSON.stringify({
    parts: message.parts,
    status: message.status,
    usage: message.usage,
  });
}

function readDbFollowOptions(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return {};
  return {
    pollMs: readPositiveDebugMs(req, "__debugPollMs", 50, RESUME_POLL_MS),
    staleMs: readPositiveDebugMs(req, "__debugStaleMs", 250, RESUME_STALE_MS),
  };
}

function readPositiveDebugMs(
  req: NextRequest,
  key: string,
  min: number,
  fallback: number
) {
  const value = Number(req.nextUrl.searchParams.get(key));
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopStreamingAssistants(
  conversationId: string,
  fallbackText = "已停止生成。"
): Promise<UiMessage[]> {
  const rows = await db
    .select({ id: schema.messages.id, parts: schema.messages.parts })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.role, "assistant"),
        eq(schema.messages.status, "streaming")
      )
    );
  if (rows.length === 0) return [];

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const parts = row.parts as MessagePart[];
      await tx
        .update(schema.messages)
        .set({
          status: "stopped",
          parts: parts.length > 0 ? parts : [{ type: "text", text: fallbackText }],
        })
        .where(eq(schema.messages.id, row.id));
    }
    await tx
      .update(schema.conversations)
      .set({ updatedAt: new Date() })
      .where(eq(schema.conversations.id, conversationId));
  });

  const stopped = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.role, "assistant"),
        eq(schema.messages.status, "stopped")
      )
    );
  const stoppedIds = new Set(rows.map((row) => row.id));
  return stopped.filter((message) => stoppedIds.has(message.id)).map(toUiMessage);
}

async function stopStaleStreamingAssistant(
  conversationId: string,
  messageId: string
): Promise<UiMessage | null> {
  const message = await loadAssistantMessageSnapshot(conversationId, messageId);
  if (!message) return null;
  if (message.status !== "streaming") return message;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.messages)
      .set({
        status: "stopped",
        parts:
          message.parts.length > 0
            ? message.parts
            : [{ type: "text", text: "⚠️ 生成已中断，可重新生成。" }],
      })
      .where(
        and(
          eq(schema.messages.id, messageId),
          eq(schema.messages.conversationId, conversationId),
          eq(schema.messages.status, "streaming")
        )
      );
    await tx
      .update(schema.conversations)
      .set({ updatedAt: new Date() })
      .where(eq(schema.conversations.id, conversationId));
  });

  return loadAssistantMessageSnapshot(conversationId, messageId);
}

function createDbFollowStreamResponse(
  conversationId: string,
  messageId: string,
  signal: AbortSignal,
  options: { initialSnapshot: UiMessage; pollMs?: number; staleMs?: number }
) {
  const encoder = new TextEncoder();
  let streamClosed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let onAbort: (() => void) | undefined;
  const stopHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          streamClosed = true;
          stopHeartbeat();
        }
      };
      const close = () => {
        if (streamClosed) return;
        streamClosed = true;
        stopHeartbeat();
        if (onAbort) signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // 客户端已取消读取时 controller 可能已经关闭。
        }
      };

      onAbort = close;
      signal.addEventListener("abort", close, { once: true });
      if (signal.aborted) {
        close();
        return;
      }

      heartbeat = setInterval(() => emit({ type: "ping" }), STREAM_HEARTBEAT_MS);
      const pollMs = options.pollMs ?? RESUME_POLL_MS;
      const staleMs = options.staleMs ?? RESUME_STALE_MS;
      let snapshot = options.initialSnapshot;
      let lastSnapshotKey = messageSnapshotKey(snapshot);
      let lastChangeAt = Date.now();

      emit({ type: "assistant-snapshot", message: snapshot });
      if (snapshot.status !== "streaming") {
        emit({
          type: "done",
          messageId: snapshot.id,
          usage: snapshot.usage,
          status: snapshot.status,
        });
        close();
        return;
      }

      try {
        while (!streamClosed) {
          await sleep(pollMs);
          if (streamClosed || signal.aborted) break;

          const next = await loadAssistantMessageSnapshot(conversationId, messageId);
          if (!next) {
            close();
            return;
          }

          const nextSnapshotKey = messageSnapshotKey(next);
          if (nextSnapshotKey !== lastSnapshotKey) {
            snapshot = next;
            lastSnapshotKey = nextSnapshotKey;
            lastChangeAt = Date.now();
            emit({ type: "assistant-snapshot", message: snapshot });
          } else {
            snapshot = next;
          }

          if (snapshot.status !== "streaming") {
            emit({
              type: "done",
              messageId: snapshot.id,
              usage: snapshot.usage,
              status: snapshot.status,
            });
            close();
            return;
          }

          if (Date.now() - lastChangeAt >= staleMs) {
            const stopped = await stopStaleStreamingAssistant(
              conversationId,
              messageId
            );
            if (stopped) {
              emit({ type: "assistant-snapshot", message: stopped });
              emit({
                type: "done",
                messageId: stopped.id,
                usage: stopped.usage,
                status: stopped.status,
              });
            }
            close();
            return;
          }
        }
      } catch (e) {
        emit({
          type: "error",
          message: e instanceof Error ? e.message : "续接生成失败",
        });
        close();
      }
    },
    cancel() {
      streamClosed = true;
      stopHeartbeat();
      if (onAbort) signal.removeEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/** 校验会话关联资源的归属，越权时抛错（IDOR 防护） */
async function assertOwnedRefs(
  userId: string,
  refs: { projectId?: string | null; skillId?: string | null; styleId?: string | null }
) {
  if (refs.projectId) {
    const [p] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, refs.projectId), eq(schema.projects.ownerId, userId))
      );
    if (!p) throw new Error("项目不存在");
  }
  if (refs.skillId) {
    // 自己的 skill 或已公开的 skill 可用
    const [s] = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(
        and(
          eq(schema.skills.id, refs.skillId),
          or(eq(schema.skills.ownerId, userId), eq(schema.skills.visibility, "public"))
        )
      );
    if (!s) throw new Error("技能不存在");
  }
  if (refs.styleId) {
    // 内置风格（ownerId 为空）或自己的风格可用
    const [st] = await db
      .select({ id: schema.styles.id })
      .from(schema.styles)
      .where(
        and(
          eq(schema.styles.id, refs.styleId),
          or(isNull(schema.styles.ownerId), eq(schema.styles.ownerId, userId))
        )
      );
    if (!st) throw new Error("回复风格不存在");
  }
}

async function prepareSend(
  input: SendMessageInput,
  userId: string
): Promise<PreparedGeneration> {
  const bootstrapEvents: StreamEvent[] = [];
  const emit = (event: StreamEvent) => bootstrapEvents.push(event);
  // 1. 会话
  let conversationId = input.conversationId;
  let isNew = false;
  let effectiveModelId = input.modelId || "";
  if (!conversationId) {
    conversationId = `c-${uid()}`;
    isNew = true;
    await assertOwnedRefs(userId, input);
    // 技能默认模型：用户未指定模型时，优先使用自定义助手自己的默认模型。
    if (!effectiveModelId && input.skillId) {
      effectiveModelId = (await getSkillDefaultModelId(userId, input.skillId)) ?? "";
    }
    // 项目级默认模型：用户未指定模型时回退到 project.modelId
    if (!effectiveModelId && input.projectId) {
      const [proj] = await db
        .select({ modelId: schema.projects.modelId })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, input.projectId),
            eq(schema.projects.ownerId, userId)
          )
        )
        .limit(1);
      if (proj?.modelId) effectiveModelId = proj.modelId;
    }
    if (!effectiveModelId) {
      effectiveModelId = (await getDefaultModelId(userId)) ?? "";
    }
    if (!effectiveModelId) {
      throw new Error("模型不可用，请在设置中选择一个模型");
    }
    await db.insert(schema.conversations).values({
      id: conversationId,
      ownerId: userId,
      modelId: effectiveModelId,
      projectId: input.projectId,
      skillId: input.skillId,
      styleId: input.styleId,
    });
    if (input.skillId) {
      await db
        .update(schema.skills)
        .set({ usageCount: sql`${schema.skills.usageCount} + 1` })
        .where(eq(schema.skills.id, input.skillId));
    }
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
    emit({
      type: "conversation-created",
      conversation: toUiConversation(conversation),
    });
  } else {
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.ownerId, userId)
        )
      );
    if (!conversation) throw new Error("会话不存在");
    if (!effectiveModelId) effectiveModelId = conversation.modelId;
  }

  // 2. 父消息（分支）
  let parentId: string | null;
  if (input.parentId !== undefined) {
    parentId = input.parentId;
  } else {
    const [conversation] = await db
      .select({ leaf: schema.conversations.currentLeafId })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
    parentId = conversation?.leaf ?? null;
  }

  // 3. 落库用户消息
  const userParts: MessagePart[] = [
    ...(input.images ?? []),
    ...(input.attachments ?? []),
    { type: "text", text: input.text },
    { type: "tool-config", tools: input.tools },
  ];
  const userMessageId = `msg-${uid()}`;
  await db.insert(schema.messages).values({
    id: userMessageId,
    conversationId,
    parentId,
    role: "user",
    parts: userParts,
    quotedText: input.quotedText,
    status: "complete",
  });
  emit({
    type: "user-message",
    message: {
      id: userMessageId,
      conversationId,
      parentId,
      role: "user",
      parts: userParts,
      quotedText: input.quotedText,
      createdAt: new Date().toISOString(),
      status: "complete",
    },
  });

  const assistantId = `msg-${uid()}`;
  return {
    conversationId,
    assistantId,
    clientGenerationId: input.clientGenerationId,
    bootstrapEvents,
    cleanupCanceledBeforeStart: isNew
      ? async () => {
          await db.transaction(async (tx) => {
            const deleted = await tx
              .delete(schema.conversations)
              .where(
                and(
                  eq(schema.conversations.id, conversationId),
                  eq(schema.conversations.ownerId, userId)
                )
              )
              .returning({ id: schema.conversations.id });
            if (input.skillId && deleted.length > 0) {
              await tx
                .update(schema.skills)
                .set({
                  usageCount: sql`greatest(${schema.skills.usageCount} - 1, 0)`,
                })
                .where(eq(schema.skills.id, input.skillId));
            }
          });
        }
      : undefined,
    run: async (streamEmit, signal) => {
      // 4. 流式生成
      await streamAssistant({
        conversationId,
        parentId: userMessageId,
        assistantId,
        modelId: effectiveModelId,
        styleId: input.styleId,
        extendedThinking: input.extendedThinking,
        toolToggles: input.tools,
        userId,
        emit: streamEmit,
        signal,
      });

      // 5. 新会话自动标题
      if (isNew) {
        try {
          const { model } = await resolveModel(effectiveModelId);
          const { text } = await generateText({
            model,
            prompt: `用不超过 15 个字为这段对话起一个标题，直接输出标题本身，不要引号和标点：\n\n${input.text.slice(0, 500)}`,
          });
          const title = text.trim().slice(0, 30) || input.text.slice(0, 20);
          await db
            .update(schema.conversations)
            .set({ title })
            .where(eq(schema.conversations.id, conversationId));
          streamEmit({ type: "title", conversationId, title });
        } catch {
          const title = input.text.slice(0, 20) || "新对话";
          await db
            .update(schema.conversations)
            .set({ title })
            .where(eq(schema.conversations.id, conversationId));
          streamEmit({ type: "title", conversationId, title });
        }
      }
    },
  };
}

async function prepareRegenerate(
  input: RegenerateInput,
  userId: string
): Promise<PreparedGeneration> {
  const [target] = await db
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.id, input.assistantMessageId),
        eq(schema.messages.conversationId, input.conversationId),
        eq(schema.messages.role, "assistant")
      )
    );
  if (!target?.parentId) throw new Error("消息不存在");
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, input.conversationId),
        eq(schema.conversations.ownerId, userId)
      )
  );
  if (!conversation) throw new Error("会话不存在");

  const parentId = target.parentId;
  const assistantId = `msg-${uid()}`;
  const toolToggles =
    (await getMessageToolToggles(parentId, input.conversationId)) ??
    inferRegenerateToolToggles(target.parts as MessagePart[]);
  return {
    conversationId: input.conversationId,
    assistantId,
    clientGenerationId: input.clientGenerationId,
    bootstrapEvents: [],
    run: (emit, signal) =>
      streamAssistant({
        conversationId: input.conversationId,
        parentId,
        assistantId,
        modelId: input.modelId ?? target.modelId ?? conversation.modelId,
        styleId: conversation.styleId ?? undefined,
        extendedThinking: true,
        persistModel: false,
        // 重试时前端不会提交当前工具开关；优先从原用户消息里恢复，
        // 兜底才从原回复中实际用过的工具推断，避免默认全开。
        toolToggles,
        userId,
        emit,
        signal,
      }),
  };
}

async function getMessageToolToggles(
  messageId: string,
  conversationId: string
): Promise<ChatToolToggles | null> {
  const [message] = await db
    .select({ parts: schema.messages.parts })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.id, messageId),
        eq(schema.messages.conversationId, conversationId)
      )
    )
    .limit(1);
  const part = (message?.parts as MessagePart[] | undefined)?.find(
    (p): p is Extract<MessagePart, { type: "tool-config" }> =>
      p.type === "tool-config"
  );
  return part?.tools ?? null;
}

function inferRegenerateToolToggles(parts: MessagePart[]): ChatToolToggles {
  const toggles: ChatToolToggles = {
    webSearch: false,
    imageGeneration: false,
    codeRunner: false,
    mcpServerIds: [],
    knowledgeBaseIds: [],
  };
  for (const part of parts) {
    if (part.type === "image") toggles.imageGeneration = true;
    if (part.type !== "tool-call") continue;
    if (
      part.toolName === "web_search" ||
      part.toolName === "web_read" ||
      part.toolName === "web_crawl" ||
      part.toolName === "tavily_extract" ||
      part.toolName === "tavily_crawl" ||
      part.toolName === "tavily_research"
    ) {
      toggles.webSearch = true;
    }
    if (part.toolName === "generate_image" || part.toolName === "edit_image") {
      toggles.imageGeneration = true;
    }
    if (part.toolName === "run_code") toggles.codeRunner = true;
  }
  return toggles;
}

/** 解析用户的有效默认模型 id：用户个人默认 → 全局默认 → 第一个可用模型 */
async function getDefaultModelId(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ defaultModelId: schema.users.defaultModelId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const [settings] = await db
    .select({ defaultChatModelId: schema.settings.defaultChatModelId })
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"))
    .limit(1);
  const enabledModels = await db
    .select({ id: schema.models.id, capabilities: schema.models.capabilities })
    .from(schema.models)
    .where(eq(schema.models.enabled, true));
  const chatModels = enabledModels.filter(
    (m) => !(m.capabilities as string[]).includes("image-generation")
  );
  const chatModelIds = new Set(chatModels.map((m) => m.id));
  if (user?.defaultModelId && chatModelIds.has(user.defaultModelId)) {
    return user.defaultModelId;
  }
  if (
    settings?.defaultChatModelId &&
    chatModelIds.has(settings.defaultChatModelId)
  ) {
    return settings.defaultChatModelId;
  }
  return chatModels[0]?.id ?? null;
}

/** 解析技能默认模型；仅当模型仍启用且可用于文本对话时生效。 */
async function getSkillDefaultModelId(
  userId: string,
  skillId: string
): Promise<string | null> {
  const [skill] = await db
    .select({ defaultModelId: schema.skills.defaultModelId })
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.id, skillId),
        or(eq(schema.skills.ownerId, userId), eq(schema.skills.visibility, "public"))
      )
    )
    .limit(1);
  if (!skill?.defaultModelId) return null;

  const [model] = await db
    .select({ id: schema.models.id, capabilities: schema.models.capabilities })
    .from(schema.models)
    .where(
      and(
        eq(schema.models.id, skill.defaultModelId),
        eq(schema.models.enabled, true)
      )
    )
    .limit(1);
  if (!model || (model.capabilities as string[]).includes("image-generation")) {
    return null;
  }
  return model.id;
}

type ResolvedChatModel = Awaited<ReturnType<typeof resolveModel>>;

async function resolveChatModel(
  modelId: string,
  userId: string
): Promise<{ resolved: ResolvedChatModel; fallbackNotice?: string }> {
  try {
    const resolved = await resolveModel(modelId);
    // 图像生成模型不能用于文本对话（会被网关拒绝 no route），
    // 自动回退到默认文本模型。图像生成应通过 generate_image 工具调用。
    if ((resolved.record.capabilities as string[]).includes("image-generation")) {
      throw new Error("IMAGE_MODEL_NOT_FOR_CHAT");
    }
    return { resolved };
  } catch {
    // 模型不存在/已禁用/不适用于对话（如图像模型）：
    // 自动回退到用户/全局默认模型，不让对话直接报错卡死。
    const fallbackId = await getDefaultModelId(userId);
    if (!fallbackId || fallbackId === modelId) {
      throw new Error("模型不可用，请在设置中选择一个模型");
    }
    const resolved = await resolveModel(fallbackId);
    return {
      resolved,
      fallbackNotice: `⚠️ 当前模型不支持对话，已自动切换为「${resolved.record.displayName}」。\n\n`,
    };
  }
}

async function streamAssistant(opts: {
  conversationId: string;
  parentId: string;
  assistantId: string;
  modelId: string;
  styleId?: string;
  extendedThinking: boolean;
  toolToggles?: ChatToolToggles;
  /** 重新生成时选择模型只是本次重试，不覆盖会话后续默认模型。 */
  persistModel?: boolean;
  userId: string;
  emit: (e: StreamEvent) => void;
  signal: AbortSignal;
}) {
  const { conversationId, parentId, assistantId, modelId, userId, emit, signal } =
    opts;
  if (signal.aborted) return;

  let resolvedChatModel: ResolvedChatModel | undefined;
  let effectiveModelId = modelId;
  let fallbackNotice: string | undefined;
  let resolutionError: unknown;
  try {
    const resolvedInfo = await resolveChatModel(modelId, userId);
    resolvedChatModel = resolvedInfo.resolved;
    effectiveModelId = resolvedInfo.resolved.record.id;
    fallbackNotice = resolvedInfo.fallbackNotice;
  } catch (e) {
    resolutionError = e;
  }
  if (signal.aborted) return;

  await stopStreamingAssistants(conversationId, "已开始新的生成，上一条已停止。");
  if (signal.aborted) return;

  const assistantStartedAt = new Date();
  await db.insert(schema.messages).values({
    id: assistantId,
    conversationId,
    parentId,
    role: "assistant",
    modelId: effectiveModelId,
    parts: [],
    status: "streaming",
  });
  const startConversationPatch: Partial<typeof schema.conversations.$inferInsert> = {
    currentLeafId: assistantId,
    updatedAt: new Date(),
  };
  if (resolvedChatModel && opts.persistModel !== false) {
    startConversationPatch.modelId = effectiveModelId;
  }
  await db
    .update(schema.conversations)
    .set(startConversationPatch)
    .where(eq(schema.conversations.id, conversationId));

  emit({
    type: "assistant-start",
    message: {
      id: assistantId,
      conversationId,
      parentId,
      role: "assistant",
      modelId: effectiveModelId,
      parts: [],
      createdAt: assistantStartedAt.toISOString(),
      status: "streaming",
    },
  });

  const parts: MessagePart[] = [];
  let usage = { inputTokens: 0, outputTokens: 0, costCents: 0 };
  let status: UiMessage["status"] = "streaming";
  let lastPersistAt = 0;
  const persistPartial = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastPersistAt < 750) return;
    lastPersistAt = now;
    await db
      .update(schema.messages)
      .set({
        parts: cloneMessageParts(parts),
        status,
        usage: usage.inputTokens > 0 ? usage : undefined,
      })
      .where(eq(schema.messages.id, assistantId));
  };
  const modelHasVision = resolvedChatModel
    ? (resolvedChatModel.record.capabilities as string[]).includes("vision")
    : false;
  const modelSupportsTools = resolvedChatModel
    ? (resolvedChatModel.record.capabilities as string[]).includes("tools")
    : false;

  // 历史消息链（从 parentId 向上回溯）
  const all = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId));
  const byId = new Map(all.map((m) => [m.id, m]));
  const chain: (typeof all)[number][] = [];
  let cursor = byId.get(parentId);
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  const history: ModelMessage[] = [];
  const assistantImageContextIds = new Set(
    chain
      .filter((m) => {
        if (m.role !== "assistant") return false;
        const msgParts = m.parts as MessagePart[];
        return msgParts.some((p) => p.type === "image");
      })
      .slice(-3)
      .map((m) => m.id)
  );
  for (const m of chain) {
    if (m.role === "system") continue;
    const msgParts = m.parts as MessagePart[];
    let text = msgParts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (m.quotedText) text = `> ${m.quotedText}\n\n${text}`;

    // 文件附件：注入抽取文本
    const fileParts = msgParts.filter((p) => p.type === "file");
    for (const f of fileParts) {
      const [att] = await db
        .select({ text: schema.attachments.extractedText, name: schema.attachments.name })
        .from(schema.attachments)
        .where(
          and(
            eq(schema.attachments.id, f.attachmentId),
            eq(schema.attachments.ownerId, userId)
          )
        );
      if (att?.text) {
        text += `\n\n<attached_file name="${att.name}">\n${att.text.slice(0, 30_000)}\n</attached_file>`;
      } else {
        text += `\n\n（用户上传了文件「${f.name}」，内容无法解析）`;
      }
    }

    const imageParts = msgParts.filter((p): p is ImagePart => p.type === "image");
    if (m.role === "user" && imageParts.length > 0) {
      const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
      if (modelHasVision) {
        const imageSrcs = await Promise.all(
          imageParts.map((img) => resolveImageSource(img.url, origin))
        );
        history.push({
          role: "user",
          content: [
            ...imageSrcs.map(toModelImageFilePart),
            { type: "text" as const, text: text || "请看这张图片。" },
          ],
        });
      } else {
        // 无视觉能力：提示模型调用 analyze_image 工具
        // 本地路径不拼 origin（网关下载不到 localhost），原样传给工具，
        // analyze_image 工具内部会把本地路径转 base64 内联。
        const urls = imageParts
          .map((img) => (img.url.startsWith("http") ? img.url : img.url))
          .join("\n");
        history.push({
          role: "user",
          content: `${text}\n\n（用户上传了图片，你无法直接查看。请调用 analyze_image 工具分析，图片路径：\n${urls}）`,
        });
      }
      continue;
    }

    if (
      m.role === "assistant" &&
      imageParts.length > 0 &&
      assistantImageContextIds.has(m.id)
    ) {
      const imageUrls = imageParts.map((img, i) => `图片${i + 1}: ${img.url}`).join("\n");
      history.push({
        role: "assistant",
        content: `${text || "已生成图片。"}\n\n（助手生成的图片：\n${imageUrls}\n如用户需要分析这张图片的视觉细节，请调用 analyze_image 工具读取对应路径。）`,
      });
      continue;
    }

    // assistant 消息里的工具调用：保留进历史，让模型在重试时能看到之前的搜索结果
    const toolCallParts = msgParts.filter(
      (p): p is ToolCallPart => p.type === "tool-call" && !!p.toolCallId
    );
    if (m.role === "assistant" && toolCallParts.length > 0) {
      if (!modelSupportsTools) {
        const summary = formatToolCallsAsText(toolCallParts);
        const content = [text.trim(), summary].filter(Boolean).join("\n\n");
        if (content) history.push({ role: "assistant", content });
        continue;
      }
      // 把 assistant 的文本 + 工具调用放进同一条 assistant 消息
      const assistantContent: ModelMessage[] = [];
      if (text.trim()) {
        assistantContent.push({
          role: "assistant",
          content: [{ type: "text", text }],
        });
      }
      // 逐个加 tool-call
      for (const tc of toolCallParts) {
        assistantContent.push({
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.args,
            },
          ],
        });
        // 紧跟 tool-result（成功才带结果；running/error 的给占位避免 SDK 报缺 result）
        const output =
          tc.state === "success"
            ? toToolResultOutput(tc.result ?? { text: "(无结果)" })
            : tc.state === "error"
              ? toToolResultOutput(
                  { error: tc.errorMessage ?? "工具调用失败" },
                  true
                )
              : toToolResultOutput({ text: "(工具调用未完成)" });
        assistantContent.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              output,
            },
          ],
        });
      }
      history.push(...assistantContent);
      continue;
    }

    if (text.trim().length > 0) {
      history.push({ role: m.role as "user" | "assistant", content: text });
    }
  }

  // 系统提示词：站点身份 + 风格 + Skill + 项目指令 + 记忆
  let system = "你是 LinHub，一个乐于助人的中文 AI 助手。使用 Markdown 格式回答。";
  if (opts.styleId) {
    const [style] = await db
      .select()
      .from(schema.styles)
      .where(eq(schema.styles.id, opts.styleId));
    if (style?.prompt) system += `\n\n回复风格要求：${style.prompt}`;
  }

  const [conv] = await db
    .select({ projectId: schema.conversations.projectId, skillId: schema.conversations.skillId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId));

  // Skill：系统提示词覆盖
  if (conv?.skillId) {
    const [skill] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, conv.skillId));
    if (skill) {
      system = `${skill.systemPrompt}\n\n（你运行在 LinHub 平台上，使用 Markdown 格式回答。）`;
    }
  }

  // 项目：自定义指令 + 项目文件
  if (conv?.projectId) {
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, conv.projectId));
    if (project?.instructions) {
      system += `\n\n本会话属于项目「${project.name}」，项目指令：\n${project.instructions}`;
    }
    const projectFiles = await db
      .select({ name: schema.attachments.name, text: schema.attachments.extractedText })
      .from(schema.attachments)
      .where(eq(schema.attachments.projectId, conv.projectId));
    const withText = projectFiles.filter((f) => f.text);
    if (withText.length > 0) {
      // 总预算 50K 字符，按文件顺序分配，超出标注省略
      const BUDGET = 50_000;
      let used = 0;
      const fileBlocks = withText.map((f) => {
        const remaining = BUDGET - used;
        if (remaining <= 0) return `<project_file name="${f.name}">\n（内容过长已省略）\n</project_file>`;
        const content = f.text!.slice(0, remaining);
        used += content.length;
        return `<project_file name="${f.name}">\n${content}${content.length < f.text!.length ? "\n…（已截断）" : ""}\n</project_file>`;
      });
      system += "\n\n项目文件内容：\n" + fileBlocks.join("\n");
    }
  }

  // 记忆注入（按项目隔离：项目内记忆 + 全局记忆）
  try {
    const memories = await loadRecentMemories(userId, 10, conv?.projectId);
    if (memories.length > 0) {
      system += `\n\n关于用户的已知信息（长期记忆）：\n${memories.map((m) => `- ${m}`).join("\n")}`;
    }
  } catch {
    // 记忆读取失败不阻塞
  }

  // Artifact 上下文：让模型能把“刚才那个作品/某标题”映射到 artifactId，
  // 否则 update_artifact 只收 id，后续更新很容易产出空响应或不会调用工具。
  try {
    const artifacts = await db
      .select({
        id: schema.artifacts.id,
        title: schema.artifacts.title,
        kind: schema.artifacts.kind,
        currentVersion: schema.artifacts.currentVersion,
      })
      .from(schema.artifacts)
      .where(eq(schema.artifacts.conversationId, conversationId));
    if (artifacts.length > 0) {
      system +=
        "\n\n当前会话已有 Artifacts（更新作品时必须使用对应 artifactId 调用 update_artifact，并传入完整更新后内容）：\n" +
        artifacts
          .map(
            (a) =>
              `- artifactId=${a.id}; title=${a.title}; kind=${a.kind}; currentVersion=${a.currentVersion}`
          )
          .join("\n");
    }
  } catch {
    // Artifact 列表读取失败不阻塞聊天
  }

  // 工具集：根据会话开关组装
  const toggles = opts.toolToggles;
  if (toggles?.codeRunner) {
    system +=
      "\n\n工具选择规则：当用户要求运行、执行、验证代码，或明确要求调用代码运行工具时，优先调用 run_code；不要用 web_search 代替本地代码运行。";
  }
  const pendingImages: string[] = [];
  let tools: ToolSet = {};
  let closeMcp: (() => Promise<void>) | undefined;
  if (toggles?.webSearch) Object.assign(tools, buildWebTools());
  if (toggles?.codeRunner) Object.assign(tools, buildCodeTools());
  if (toggles?.imageGeneration)
    Object.assign(
      tools,
      buildImageTools(userId, (url) => pendingImages.push(url))
    );
  Object.assign(tools, buildVisionTool());
  Object.assign(tools, buildArtifactTools(conversationId));
  Object.assign(tools, buildMemoryTools(userId, conversationId, conv?.projectId));
  Object.assign(tools, buildKnowledgeTool(userId, toggles?.knowledgeBaseIds ?? []));
  try {
    const mcp = await buildMcpTools(userId, toggles?.mcpServerIds ?? []);
    Object.assign(tools, mcp.tools);
    closeMcp = mcp.close;
  } catch {
    // MCP 初始化失败不阻塞聊天
  }
  const hasTools = Object.keys(tools).length > 0;

  let streamResult: ReturnType<typeof streamText> | undefined;

  try {
    if (!resolvedChatModel) {
      throw resolutionError instanceof Error
        ? resolutionError
        : new Error("模型不可用，请在设置中选择一个模型");
    }
    if (fallbackNotice) {
      appendDelta(parts, "text", fallbackNotice);
      emit({
        type: "text-delta",
        messageId: assistantId,
        delta: fallbackNotice,
      });
      await persistPartial(true);
    }
    const { model, record, provider, storeEnabled } = resolvedChatModel;
    // Pro 模型需订阅（C8）；余额/额度预检防透支（C2）
    await assertModelAccess(userId, record);
    const estimatedInputTokens = estimatePromptTokens(system, history);
    // 预检只拦截明显余额不足，不能按 maxOutputTokens 的最坏情况收费，
    // 否则一句很短的对话也可能被高上限模型误拒。
    const estimatedOutputTokens = Math.min(record.maxOutputTokens ?? 4096, 256);
    await assertCanSpend(
      userId,
      computeCostCents(record, {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
      })
    );
    if (!modelSupportsTools) tools = {};
    const openaiProviderOptions: JSONObject = {};
    if (provider.kind === "openai") {
      if ((record.capabilities as string[]).includes("reasoning")) {
        openaiProviderOptions.reasoningEffort = opts.extendedThinking
          ? "high"
          : "medium";
        if (!provider.baseUrl && storeEnabled) {
          openaiProviderOptions.reasoningSummary = opts.extendedThinking
            ? "detailed"
            : "auto";
        }
      }
      // 走中转网关的 OpenAI Responses API 常不持久化 reasoning item，
      // 关闭 store 后多步工具循环不会再以 item_reference 引用上一轮的 rs_xxx
      if (!storeEnabled) openaiProviderOptions.store = false;
    }
    const result = streamText({
      model,
      system,
      messages: history,
      abortSignal: signal,
      ...(record.maxOutputTokens ? { maxOutputTokens: record.maxOutputTokens } : {}),
      ...(hasTools && modelSupportsTools
        ? { tools, stopWhen: stepCountIs(8) }
        : {}),
      ...(Object.keys(openaiProviderOptions).length > 0
        ? { providerOptions: { openai: openaiProviderOptions } }
        : {}),
    });
    streamResult = result;

    let reasoningStart = 0;
    const toolParts = new Map<string, ToolCallPart>();
    for await (const chunk of result.fullStream) {
      if (signal.aborted) {
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      if (chunk.type === "reasoning-start") {
        reasoningStart = Date.now();
      } else if (chunk.type === "reasoning-delta") {
        if (!chunk.text) continue;
        if (reasoningStart === 0) reasoningStart = Date.now();
        appendDelta(parts, "reasoning", chunk.text);
        emit({ type: "reasoning-delta", messageId: assistantId, delta: chunk.text });
        await persistPartial();
      } else if (chunk.type === "reasoning-end") {
        const duration = Date.now() - reasoningStart;
        const last = parts[parts.length - 1];
        if (last?.type === "reasoning" && last.text.trim().length > 0) {
          last.durationMs = Math.max(0, duration);
          emit({
            type: "reasoning-done",
            messageId: assistantId,
            durationMs: last.durationMs,
          });
          await persistPartial(true);
        }
      } else if (chunk.type === "text-delta") {
        appendDelta(parts, "text", chunk.text);
        emit({ type: "text-delta", messageId: assistantId, delta: chunk.text });
        await persistPartial();
      } else if (chunk.type === "tool-input-start") {
        // 工具调用开始：先建一个 running 的 part（args 为空），
        // 让前端立刻展示「搜索中…」卡片，而不是干等参数生成完。
        const part: ToolCallPart = {
          type: "tool-call",
          toolCallId: chunk.id,
          toolName: chunk.toolName as ToolCallPart["toolName"],
          args: {},
          state: "running",
          inputPreview: "",
        };
        toolParts.set(chunk.id, part);
        parts.push(part);
        emit({ type: "tool-call-start", messageId: assistantId, part });
        await persistPartial(true);
      } else if (chunk.type === "tool-input-delta") {
        // 工具参数逐字生成（如 web_search 的 query），实时累加预览文本。
        const part = toolParts.get(chunk.id);
        if (part) {
          part.inputPreview = (part.inputPreview ?? "") + chunk.delta;
          emit({
            type: "tool-input-delta",
            messageId: assistantId,
            toolCallId: chunk.id,
            delta: chunk.delta,
          });
          await persistPartial();
        }
      } else if (chunk.type === "tool-call") {
        // 参数生成完毕，工具真正开始执行：用完整结构化 input 覆盖 args，清掉预览。
        const existing = toolParts.get(chunk.toolCallId);
        if (existing) {
          existing.args = (chunk.input ?? {}) as Record<string, unknown>;
          existing.inputPreview = undefined;
          emit({ type: "tool-call-start", messageId: assistantId, part: { ...existing } });
          await persistPartial(true);
        } else {
          // 兜底：若 tool-input-start 未到达（部分模型不发），沿用旧逻辑创建。
          const part: ToolCallPart = {
            type: "tool-call",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName as ToolCallPart["toolName"],
            args: (chunk.input ?? {}) as Record<string, unknown>,
            state: "running",
          };
          toolParts.set(chunk.toolCallId, part);
          parts.push(part);
          emit({ type: "tool-call-start", messageId: assistantId, part });
          await persistPartial(true);
        }
      } else if (chunk.type === "tool-result") {
        const part = toolParts.get(chunk.toolCallId);
        if (part) {
          part.state = "success";
          part.result = summarizeToolResult(chunk.output);
          emit({ type: "tool-call-end", messageId: assistantId, part });
          if (
            (part.toolName === "create_artifact" ||
              part.toolName === "update_artifact") &&
            part.result?.artifactId
          ) {
            const [artifact] = await db
              .select()
              .from(schema.artifacts)
              .where(eq(schema.artifacts.id, part.result.artifactId))
              .limit(1);
            if (artifact) {
              emit({
                type: "artifact",
                messageId: assistantId,
                artifact: toUiArtifact(artifact),
              });
            }
          }
          // 生图工具产出的图片作为独立 part 展示
          while (pendingImages.length > 0) {
            const url = pendingImages.shift()!;
            const imagePart: ImagePart = { type: "image", url, alt: "生成的图片" };
            parts.push(imagePart);
            emit({ type: "image", messageId: assistantId, part: imagePart });
          }
          await persistPartial(true);
        }
      } else if (chunk.type === "tool-error") {
        const part = toolParts.get(chunk.toolCallId);
        if (part) {
          part.state = "error";
          part.errorMessage =
            chunk.error instanceof Error ? chunk.error.message : String(chunk.error);
          emit({ type: "tool-call-end", messageId: assistantId, part });
          await persistPartial(true);
        }
      } else if (chunk.type === "error") {
        throw chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error));
      }
    }

    if (signal.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    if (parts.length === 0) {
      status = "error";
      appendDelta(parts, "text", "⚠️ 模型没有返回内容，请重试。");
      emit({
        type: "text-delta",
        messageId: assistantId,
        delta: "⚠️ 模型没有返回内容，请重试。",
      });
      await persistPartial(true);
    }

    const finalUsage = await result.usage;
    const inputTokens = finalUsage.inputTokens ?? 0;
    const outputTokens = finalUsage.outputTokens ?? 0;
    usage = {
      inputTokens,
      outputTokens,
      costCents: computeCostCents(record, { inputTokens, outputTokens }),
    };

    // 计费落库
    await recordUsage(userId, record, conversationId, usage, { allowDebt: true });
    await closeMcp?.();
    if (status === "streaming") status = "complete";
  } catch (e) {
    await closeMcp?.();
    if (signal.aborted || (e instanceof Error && e.name === "AbortError")) {
      status = "stopped";
      // 中止也要为已产生的 token 计费（C3：防逃单）
      try {
        const record = resolvedChatModel?.record;
        if (!record) throw new Error("模型不可用");
        // 优先取 SDK 真实用量（限 2s，abort 后可能拿不到）；否则按字符数估算
        let inputTokens = 0;
        let outputTokens = 0;
        try {
          const real = await Promise.race([
            streamResult?.usage,
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000)),
          ]);
          inputTokens = real?.inputTokens ?? 0;
          outputTokens = real?.outputTokens ?? 0;
        } catch {
          const historyChars = history.reduce(
            (n, m) => n + (typeof m.content === "string" ? m.content.length : 500),
            system.length
          );
          const outputChars = parts.reduce(
            (n, p) => n + ("text" in p && typeof p.text === "string" ? p.text.length : 0),
            0
          );
          inputTokens = Math.ceil(historyChars / 4);
          outputTokens = Math.ceil(outputChars / 4);
        }
        if (inputTokens > 0 || outputTokens > 0) {
          usage = {
            inputTokens,
            outputTokens,
            costCents: computeCostCents(record, { inputTokens, outputTokens }),
          };
          await recordUsage(userId, record, conversationId, usage, { allowDebt: true });
        }
      } catch {
        // 中止计费失败不阻塞消息落库
      }
    } else {
      status = "error";
      const isBilling = e instanceof Error && e.name === "BillingError";
      const rawMsg = getErrorMessage(e);
      const msg = formatChatErrorMessage(rawMsg);
      const errorText =
        `${parts.length === 0 ? "" : "\n\n"}⚠️ ${msg}` +
        (parts.length === 0 && !isBilling && shouldShowProviderConfigHint(rawMsg)
          ? "\n\n请联系管理员在「管理后台 → 供应商」中检查该模型的 API Key 配置。"
          : "");
      appendDelta(parts, "text", errorText);
      emit({
        type: "text-delta",
        messageId: assistantId,
        delta: errorText,
      });
      await persistPartial(true);
    }
  }

  await db
    .update(schema.messages)
    .set({
      modelId: effectiveModelId,
      parts: cloneMessageParts(parts),
      status,
      usage: usage.inputTokens > 0 ? usage : undefined,
    })
    .where(eq(schema.messages.id, assistantId));
  const conversationPatch: Partial<typeof schema.conversations.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (status !== "stopped") {
    conversationPatch.currentLeafId = assistantId;
  }
  if (resolvedChatModel && opts.persistModel !== false) {
    conversationPatch.modelId = effectiveModelId;
  }
  await db
    .update(schema.conversations)
    .set(conversationPatch)
    .where(eq(schema.conversations.id, conversationId));

  emit({
    type: "assistant-snapshot",
    message: {
      id: assistantId,
      conversationId,
      parentId,
      role: "assistant",
      modelId: effectiveModelId,
      parts: cloneMessageParts(parts),
      createdAt: assistantStartedAt.toISOString(),
      status,
      usage: usage.inputTokens > 0 ? usage : undefined,
    },
  });
  emit({
    type: "done",
    messageId: assistantId,
    usage: usage.inputTokens > 0 ? usage : undefined,
    status,
  });
}

function summarizeToolResult(output: unknown): ToolResultSummary {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    const summary: ToolResultSummary = {};
    if (Array.isArray(o.sources)) summary.sources = o.sources as ToolResultSummary["sources"];
    if (Array.isArray(o.images)) summary.images = o.images as string[];
    if (typeof o.artifactId === "string") summary.artifactId = o.artifactId;
    if (typeof o.artifactTitle === "string") summary.artifactTitle = o.artifactTitle;
    if (typeof o.answer === "string") summary.text = o.answer;
    else if (typeof o.text === "string") summary.text = o.text.slice(0, 500);
    if (Object.keys(summary).length > 0) return summary;
    return { text: JSON.stringify(output).slice(0, 500) };
  }
  return { text: String(output).slice(0, 500) };
}

function formatToolCallsAsText(parts: ToolCallPart[]) {
  const lines = parts.flatMap((part) => {
    if (part.state !== "success" || !part.result) return [];
    const result = part.result;
    const chunks = result.chunks?.map(
      (chunk) =>
        `- ${chunk.documentName ?? "知识库"}#${chunk.chunkIndex}: ${chunk.snippet}`
    );
    const sources = result.sources?.map(
      (source) => `- ${source.title}: ${source.snippet ?? source.url}`
    );
    const images = result.images?.map((url) => `- 图片: ${url}`);
    const text = result.text ? [`- ${result.text}`] : [];
    const detail = [...text, ...(chunks ?? []), ...(sources ?? []), ...(images ?? [])]
      .join("\n")
      .slice(0, 2000);
    return detail
      ? [`此前工具「${part.toolName}」结果摘要：\n${detail}`]
      : [];
  });
  return lines.join("\n\n");
}

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

function toJsonValue(value: unknown): JsonValue {
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return String(value);
  }
}

function toToolResultOutput(output: unknown, isError = false) {
  return {
    type: isError ? ("error-json" as const) : ("json" as const),
    value: toJsonValue(output),
  };
}

function toModelImageFilePart(src: string) {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(src);
  if (match) {
    return {
      type: "file" as const,
      data: { type: "data" as const, data: match[2] },
      mediaType: match[1],
    };
  }
  return {
    type: "file" as const,
    data: { type: "url" as const, url: new URL(src) },
    mediaType: "image",
  };
}

function getErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : "生成失败";
}

function formatChatErrorMessage(message: string) {
  if (/Cannot connect to API|Connect Timeout|fetch failed|ECONN|ETIMEDOUT|timeout/i.test(message)) {
    return "模型服务连接超时，请稍后重试或切换模型。";
  }
  if (/rate limit|too many requests|429/i.test(message)) {
    return "模型服务请求过于频繁，请稍后重试。";
  }
  return message || "生成失败";
}

function shouldShowProviderConfigHint(message: string) {
  if (/Cannot connect to API|Connect Timeout|fetch failed|ECONN|ETIMEDOUT|timeout|rate limit|429/i.test(message)) {
    return false;
  }
  return true;
}

function appendDelta(
  parts: MessagePart[],
  type: "text" | "reasoning",
  delta: string
) {
  const last = parts[parts.length - 1];
  if (last && last.type === type) {
    last.text += delta;
  } else {
    parts.push({ type, text: delta } as MessagePart);
  }
}

function cloneMessageParts(parts: MessagePart[]): MessagePart[] {
  return JSON.parse(JSON.stringify(parts)) as MessagePart[];
}

function estimatePromptTokens(system: string, messages: ModelMessage[]) {
  const chars = messages.reduce((total, message) => {
    if (typeof message.content === "string") return total + message.content.length;
    return (
      total +
      message.content.reduce((partTotal, part) => {
        if (part.type === "text") return partTotal + part.text.length;
        // 图片/文件的真实 token 由供应商决定，这里按一个保守下界预检。
        return partTotal + 2000;
      }, 0)
    );
  }, system.length);
  return Math.ceil(chars / 4);
}

function toUiMessage(m: typeof schema.messages.$inferSelect): UiMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    parentId: m.parentId,
    role: m.role,
    parts: m.parts as MessagePart[],
    modelId: m.modelId ?? undefined,
    quotedText: m.quotedText ?? undefined,
    feedback: m.feedback ?? undefined,
    usage: m.usage ?? undefined,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };
}

function toUiConversation(c: typeof schema.conversations.$inferSelect) {
  return {
    id: c.id,
    title: c.title,
    projectId: c.projectId ?? undefined,
    skillId: c.skillId ?? undefined,
    modelId: c.modelId,
    styleId: c.styleId ?? undefined,
    pinned: c.pinned,
    archived: c.archived,
    currentLeafId: c.currentLeafId ?? undefined,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

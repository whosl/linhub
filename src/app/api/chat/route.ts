import { NextRequest } from "next/server";
import { eq, and, or, isNull, sql, desc, inArray } from "drizzle-orm";
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
import { buildBaseSystemPrompt } from "@/lib/server/llm/system-prompt";
import {
  assertCanSpend,
  getActiveSubscription,
  assertModelAccess,
  recordUsage,
} from "@/lib/server/billing";
import { rateLimit } from "@/lib/server/rate-limit";
import { toUiArtifact } from "@/app/api/artifacts/util";
import { resolveImageSource } from "@/lib/server/llm/image-source";
import { sanitizeAssistantText, sanitizeReasoningText } from "@/lib/chat-text";
import {
  describeImageFromBuffer,
  prepareVisionImage,
} from "@/lib/server/vision-describe";
import {
  buildArtifactTools,
  buildCodeTools,
  buildImageTools,
  buildKnowledgeTool,
  buildMcpTools,
  buildMemoryTools,
  buildPptxTools,
  buildSkillPackTools,
  buildSpreadsheetTools,
  buildVisionTool,
  buildWebTools,
  loadRecentMemories,
} from "@/lib/server/llm/tools";
import {
  composeSkillPackPrompt,
  mergeSkillToggles,
} from "@/lib/server/skill-runtime";
import {
  isVisionDirectedQuery,
  persistToolRoutingDecision,
  resolveToolRouting,
} from "@/lib/server/llm/tool-router";
import {
  isContextualCodeFollowUp,
  isContextualImageFollowUp,
  isContextualKnowledgeFollowUp,
  isCodeExecutionDirectedQuery,
  isImageGenerationDirectedQuery,
  isKnowledgeDirectedQuery,
  isProjectMaterialDirectedQuery,
} from "@/lib/server/llm/tool-intent";
import type {
  ChatToolToggles,
  ImagePart,
  Message as UiMessage,
  MessagePart,
  ThinkingEffort,
  RoutingBuiltin,
  SendMessageInput,
  StreamEvent,
  ToolCallPart,
  ToolResultSummary,
} from "@/lib/types";
import {
  canceledClientIds,
  chatTasks,
  chatTasksByClientId,
  clientGenerationKey,
  isLiveTask,
  pendingGenerationKeys,
  PENDING_GENERATION_STALE_MS,
  type ChatEmit,
  type ChatGenerationTask,
  type ChatSubscriber,
} from "@/lib/server/chat-task-registry";

export const maxDuration = 1800;

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
// 普通聊天的工具循环必须有硬上限；深度调研/数据分析走独立的 Skill Run。
const MAX_TOOL_STEPS = 40;
const RESUME_POLL_MS = 750;
const RESUME_STALE_MS = 120_000;
const STREAM_HEARTBEAT_MS = 15_000;
const DEFAULT_TOOL_TIMEOUT_MS = 45_000;
const CHAT_TOTAL_TIMEOUT_MS = 29 * 60_000;
const LONG_RUNNING_TOOL_TIMEOUTS = {
  run_codeMs: 120_000,
  start_code_labMs: 1_200_000,
  generate_imageMs: 120_000,
  edit_imageMs: 120_000,
  pptx_create_deckMs: 180_000,
  dashi_render_deckMs: 600_000,
} as const;
const MEDIA_URL_PATTERN = /^\/api\/media\/([A-Za-z0-9._-]+)$/;
const CLIENT_ENTITY_ID_PATTERN = /^(?:c|msg)-[a-f0-9]{16}$/;

interface RegenerateInput {
  regenerate: true;
  clientGenerationId?: string;
  conversationId: string;
  assistantMessageId: string;
  clientAssistantMessageId?: string;
  modelId?: string;
}

type ChatRequest = SendMessageInput | RegenerateInput;
type SdkReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

interface PreparedGeneration {
  conversationId: string;
  assistantId: string;
  clientGenerationId?: string;
  bootstrapEvents: StreamEvent[];
  cleanupCanceledBeforeStart?: () => Promise<void>;
  run: (emit: ChatEmit, signal: AbortSignal) => Promise<void>;
}

class ChatBusyError extends Error {
  constructor() {
    super("当前会话正在生成，请稍后再试");
    this.name = "ChatBusyError";
  }
}

function validatedClientEntityId(
  value: string | undefined,
  prefix: "c" | "msg"
) {
  if (value == null) return undefined;
  if (!CLIENT_ENTITY_ID_PATTERN.test(value) || !value.startsWith(`${prefix}-`)) {
    throw new Error("客户端生成的资源 ID 无效");
  }
  return value;
}

function requestedConversationId(body: ChatRequest) {
  return "regenerate" in body ? body.conversationId : body.conversationId;
}

function requestedClientGenerationId(body: ChatRequest) {
  return "regenerate" in body ? body.clientGenerationId : body.clientGenerationId;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJson(entry)])
    );
  }
  return value;
}

function jsonSemanticallyEqual(left: unknown, right: unknown) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function referencedMediaAssetIds(input: SendMessageInput): string[] {
  const ids = new Set<string>();
  for (const attachment of input.attachments ?? []) {
    if (attachment.attachmentId) ids.add(attachment.attachmentId);
  }
  for (const image of input.images ?? []) {
    if (image.mediaAssetId) {
      ids.add(image.mediaAssetId);
      continue;
    }
    const matched = MEDIA_URL_PATTERN.exec(image.url);
    if (matched?.[1]) ids.add(matched[1]);
  }
  return [...ids];
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

  const existingTask = body.clientGenerationId
    ? chatTasksByClientId.get(clientGenerationKey(userId, body.clientGenerationId))
    : undefined;
  if (isLiveTask(existingTask, userId)) {
    return createTaskStreamResponse(existingTask, req.signal, {
      replayBufferedEvents: true,
      syncAssistantSnapshot: true,
    });
  }

  let prepared: PreparedGeneration;
  let releaseGenerationSlot: (() => void) | undefined;
  try {
    const origin = req.nextUrl.origin;
    releaseGenerationSlot = await reserveGenerationSlot(body, userId);
    prepared =
      "regenerate" in body
        ? await prepareRegenerate(body, userId, origin)
        : await prepareSend(body, userId, origin);
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
  const limited =
    rateLimit(`chat-resume:${session.user.id}`, 120, 60_000) ??
    rateLimit(`chat-resume:${session.user.id}:${conversationId}`, 30, 60_000);
  if (limited) return limited;
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

  const nonAssistantStateEvents = events.filter(
    (event) => event.type === "routing-decision"
  );
  const replay = events
    .slice(coveredUntil)
    .filter((event) => shouldReplayLiveEventAfterSnapshot(task, event));
  return [...nonAssistantStateEvents, ...replay];
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
    case "routing-decision":
      return false;
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

function settleRunningToolParts(parts: MessagePart[], message: string) {
  return parts.map((part) =>
    part.type === "tool-call" && part.state === "running"
      ? {
          ...part,
          state: "error" as const,
          inputPreview: undefined,
          errorMessage: message,
        }
      : part
  );
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
    case "routing-decision":
      return true;
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
      const parts = settleRunningToolParts(
        row.parts as MessagePart[],
        "生成已停止，可重新生成。"
      );
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
            ? settleRunningToolParts(
                message.parts,
                "工具长时间没有返回，生成已中断，可重新生成。"
              )
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
  userId: string,
  origin: string
): Promise<PreparedGeneration> {
  const bootstrapEvents: StreamEvent[] = [];
  const emit = (event: StreamEvent) => bootstrapEvents.push(event);
  // 1. 会话
  let conversationId = input.conversationId;
  let isNew = false;
  let effectiveModelId = input.modelId || "";
  // 无论新/旧会话，都校验 style/project/skill 归属，防止 IDOR
  await assertOwnedRefs(userId, input);
  if (!conversationId) {
    conversationId =
      validatedClientEntityId(input.clientConversationId, "c") ?? `c-${uid()}`;
    const [existingConversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1);
    if (existingConversation && existingConversation.ownerId !== userId) {
      throw new Error("客户端生成的会话 ID 已被占用");
    }
    if (existingConversation) {
      effectiveModelId ||= existingConversation.modelId;
      emit({
        type: "conversation-created",
        conversation: toUiConversation(existingConversation),
      });
    } else {
      isNew = true;
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
        if (
          proj?.modelId &&
          (await isAccessibleChatModelForUser(userId, proj.modelId))
        ) {
          effectiveModelId = proj.modelId;
        }
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
    }
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

  const requestedUserMessageId = validatedClientEntityId(
    input.clientUserMessageId,
    "msg"
  );
  const userMessageId = requestedUserMessageId ?? `msg-${uid()}`;
  const proposedUserParts: MessagePart[] = [
    ...(input.images ?? []),
    ...(input.attachments ?? []),
    { type: "text", text: input.text },
    { type: "tool-config", tools: input.tools },
  ];
  const [existingUserMessage] = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, userMessageId))
    .limit(1);
  if (
    existingUserMessage &&
    (existingUserMessage.conversationId !== conversationId ||
      existingUserMessage.role !== "user")
  ) {
    throw new Error("客户端生成的消息 ID 已被占用");
  }
  if (
    existingUserMessage &&
    (!jsonSemanticallyEqual(existingUserMessage.parts, proposedUserParts) ||
      (existingUserMessage.quotedText ?? undefined) !== input.quotedText)
  ) {
    throw new Error("同一发送操作不能更改消息内容");
  }

  // 2. 父消息（分支）。幂等重试必须沿用第一次落库时的父节点。
  let parentId: string | null;
  if (existingUserMessage) {
    parentId = existingUserMessage.parentId;
  } else if (input.parentId !== undefined) {
    parentId = input.parentId;
    if (parentId) {
      const [parentMsg] = await db
        .select({ id: schema.messages.id })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.id, parentId),
            eq(schema.messages.conversationId, conversationId)
          )
        )
        .limit(1);
      if (!parentMsg) throw new Error("父消息不属于当前会话");
    }
  } else {
    const [conversation] = await db
      .select({ leaf: schema.conversations.currentLeafId })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
    parentId = conversation?.leaf ?? null;
  }

  // 3. 落库用户消息；相同客户端消息 ID 的重试直接复用已有行。
  const userParts = existingUserMessage
    ? (existingUserMessage.parts as MessagePart[])
    : proposedUserParts;
  if (!existingUserMessage) {
    await db.insert(schema.messages).values({
      id: userMessageId,
      conversationId,
      parentId,
      role: "user",
      parts: userParts,
      quotedText: input.quotedText,
      status: "complete",
    });
    const mediaAssetIds = referencedMediaAssetIds(input);
    if (mediaAssetIds.length > 0) {
      await db
        .update(schema.mediaAssets)
        .set({ conversationId, messageId: userMessageId })
        .where(
          and(
            eq(schema.mediaAssets.ownerId, userId),
            inArray(schema.mediaAssets.id, mediaAssetIds)
          )
        );
    }
  }
  emit({
    type: "user-message",
    message: {
      id: userMessageId,
      conversationId,
      parentId,
      role: "user",
      parts: userParts,
      quotedText: input.quotedText,
      createdAt: existingUserMessage?.createdAt.toISOString() ?? new Date().toISOString(),
      status: "complete",
    },
  });

  const assistantId =
    validatedClientEntityId(input.clientAssistantMessageId, "msg") ?? `msg-${uid()}`;
  const [existingAssistant] = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, assistantId))
    .limit(1);
  if (
    existingAssistant &&
    (existingAssistant.conversationId !== conversationId ||
      existingAssistant.parentId !== userMessageId ||
      existingAssistant.role !== "assistant")
  ) {
    throw new Error("客户端生成的助手消息 ID 已被占用");
  }
  const assistantAlreadyFinal =
    existingAssistant != null && existingAssistant.status !== "streaming";
  if (assistantAlreadyFinal) {
    emit({
      type: "assistant-snapshot",
      message: toUiMessage(existingAssistant),
    });
    emit({
      type: "done",
      messageId: assistantId,
      usage: (existingAssistant.usage as UiMessage["usage"] | null) ?? undefined,
      status: existingAssistant.status,
    });
  }
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
      if (assistantAlreadyFinal) return;
      // 4. 流式生成
      await streamAssistant({
        conversationId,
        parentId: userMessageId,
        assistantId,
        modelId: effectiveModelId,
        styleId: input.styleId,
        extendedThinking: input.extendedThinking,
        thinkingEffort: input.thinkingEffort,
        toolToggles: input.tools,
        userId,
        origin,
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
  userId: string,
  origin: string
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
  const assistantId =
    validatedClientEntityId(input.clientAssistantMessageId, "msg") ?? `msg-${uid()}`;
  const [existingAssistant] = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, assistantId))
    .limit(1);
  if (
    existingAssistant &&
    (existingAssistant.conversationId !== input.conversationId ||
      existingAssistant.parentId !== parentId ||
      existingAssistant.role !== "assistant")
  ) {
    throw new Error("客户端生成的助手消息 ID 已被占用");
  }
  const assistantAlreadyFinal =
    existingAssistant != null && existingAssistant.status !== "streaming";
  const toolToggles =
    (await getMessageToolToggles(parentId, input.conversationId)) ??
    inferRegenerateToolToggles(target.parts as MessagePart[]);
  return {
    conversationId: input.conversationId,
    assistantId,
    clientGenerationId: input.clientGenerationId,
    bootstrapEvents: assistantAlreadyFinal
      ? [
          { type: "assistant-snapshot", message: toUiMessage(existingAssistant) },
          {
            type: "done",
            messageId: assistantId,
            usage: (existingAssistant.usage as UiMessage["usage"] | null) ?? undefined,
            status: existingAssistant.status,
          },
        ]
      : [],
    run: async (emit, signal) => {
      if (assistantAlreadyFinal) return;
      await streamAssistant({
        conversationId: input.conversationId,
        parentId,
        assistantId,
        modelId: input.modelId ?? target.modelId ?? conversation.modelId,
        styleId: conversation.styleId ?? undefined,
        extendedThinking: true,
        thinkingEffort: "high",
        persistModel: false,
        // 重试时前端不会提交当前工具开关；恢复原始许可后仍由服务端强制关闭智能路由。
        // 旧消息没有 originalTools 时才复用当时的实际挂载结果。
        toolToggles,
        userId,
        origin,
        emit,
        signal,
      });
    },
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
  const original = normalizeChatToolToggles(part?.originalTools);
  if (original) return original;

  const restored = part?.routing?.finalTools ?? part?.tools;
  const normalized = normalizeChatToolToggles(restored);
  return normalized ? { ...normalized, autoRouting: false } : null;
}

function normalizeChatToolToggles(
  tools: ChatToolToggles | null | undefined
): ChatToolToggles | null {
  if (!tools) return null;
  return {
    // 默认手动模式；历史消息显式开启时保留当时的路由选择。
    autoRouting: tools.autoRouting ?? false,
    webSearch: tools.webSearch ?? false,
    imageGeneration: tools.imageGeneration ?? false,
    codeRunner: tools.codeRunner ?? false,
    knowledgeSearch: tools.knowledgeSearch ?? true,
    mcpServerIds: tools.mcpServerIds ?? [],
    knowledgeBaseIds: tools.knowledgeBaseIds ?? [],
  };
}

function inferRegenerateToolToggles(parts: MessagePart[]): ChatToolToggles {
  const toggles: ChatToolToggles = {
    autoRouting: false,
    webSearch: false,
    imageGeneration: false,
    codeRunner: false,
    knowledgeSearch: false,
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
    if (part.toolName === "search_knowledge") toggles.knowledgeSearch = true;
  }
  return toggles;
}

function builtinsFromEnabledPlan(plan: Record<RoutingBuiltin, boolean>) {
  return (Object.keys(plan) as RoutingBuiltin[]).filter((name) => plan[name]);
}

function applySkillBuiltinPlan(
  plan: Record<RoutingBuiltin, boolean>,
  skill: typeof schema.skills.$inferSelect | undefined,
  toggles: ChatToolToggles
) {
  if (!skill || skill.kind !== "pack") return;
  const tools = new Set([
    ...((skill.enabledTools ?? []) as string[]),
    ...((skill.requiredTools ?? []) as string[]),
  ]);
  if (toggles.webSearch && (tools.has("web_search") || tools.has("web_read"))) {
    plan.webSearch = true;
  }
  if (toggles.codeRunner && tools.has("run_code")) plan.codeRunner = true;
  if (
    toggles.imageGeneration &&
    (tools.has("generate_image") || tools.has("edit_image"))
  ) {
    plan.imageGeneration = true;
  }
  if (toggles.knowledgeSearch && tools.has("search_knowledge")) {
    plan.knowledgeSearch = true;
  }
  if (
    skill.id === "skill-pptx-native" ||
    Array.from(tools).some(
      (tool) => tool.startsWith("pptx_") || tool.startsWith("dashi_")
    )
  ) {
    plan.pptx = true;
    plan.artifacts = true;
  }
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
    .select({
      id: schema.models.id,
      capabilities: schema.models.capabilities,
      tier: schema.models.tier,
    })
    .from(schema.models)
    .where(eq(schema.models.enabled, true));
  const hasProAccess = await userHasProAccess(userId);
  const chatModels = enabledModels.filter(
    (m) =>
      !(m.capabilities as string[]).includes("image-generation") &&
      (m.tier !== "pro" || hasProAccess)
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

  if (!(await isAccessibleChatModelForUser(userId, skill.defaultModelId))) return null;
  return skill.defaultModelId;
}

type ResolvedChatModel = Awaited<ReturnType<typeof resolveModel>>;

function shouldInlineVisionInput(resolved: ResolvedChatModel) {
  // 原生 vision 模型一律尝试内联；网关对 data URL 的兼容由 sanitizeOpenAIChatStreamFetch 处理。
  // analyze_image 仅在无视觉能力或内联解析失败时再挂载。
  return (resolved.record.capabilities as string[]).includes("vision");
}

async function userHasProAccess(userId: string) {
  return (await getActiveSubscription(userId))?.plan.modelTier === "pro";
}

async function isAccessibleChatModelForUser(userId: string, modelId: string) {
  const [model] = await db
    .select({ capabilities: schema.models.capabilities, tier: schema.models.tier })
    .from(schema.models)
    .where(and(eq(schema.models.id, modelId), eq(schema.models.enabled, true)))
    .limit(1);
  if (!model || (model.capabilities as string[]).includes("image-generation")) {
    return false;
  }
  return model.tier !== "pro" || (await userHasProAccess(userId));
}

async function tryResolveHistoryImageSource(url: string, origin: string) {
  try {
    const source = await resolveImageSource(url, origin);
    // 大图先压缩再内联，降低中转网关序列化栈溢出概率
    if (source.startsWith("data:")) {
      const comma = source.indexOf(";base64,");
      if (comma > 0) {
        const mime = source.slice(5, comma) || "image/png";
        const prepared = await prepareVisionImage(
          Buffer.from(source.slice(comma + 8), "base64"),
          mime
        );
        return {
          ok: true as const,
          source: `data:${prepared.mimeType};base64,${prepared.buffer.toString("base64")}`,
          url,
        };
      }
    }
    return { ok: true as const, source, url };
  } catch (e) {
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : "图片无法读取",
      url,
    };
  }
}

function isInlineVisionRequestError(message: string) {
  return /Maximum call stack size exceeded|invalid image|unsupported image|image_url|does not support image|multimodal|vision|图片过大|图片\/多模态/i.test(
    message
  );
}

/** 从 data URL / http(s) 解析出 buffer，供辅助识图使用 */
async function bufferFromImageSource(source: string): Promise<{ buffer: Buffer; mime: string }> {
  if (source.startsWith("data:")) {
    const comma = source.indexOf(";base64,");
    if (comma < 0) throw new Error("无法解析图片 data URL");
    return {
      buffer: Buffer.from(source.slice(comma + 8), "base64"),
      mime: source.slice(5, comma) || "image/png",
    };
  }
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`下载图片失败（${res.status}）`);
    const ct = res.headers.get("content-type");
    const mime = ct?.startsWith("image/") ? ct.split(";")[0]!.trim() : "image/png";
    return { buffer: Buffer.from(await res.arrayBuffer()), mime };
  }
  throw new Error("不支持的图片地址");
}

/**
 * 内联视觉请求失败后：立刻用辅助识图模型读图，把 OCR/描述注入历史，
 * 并去掉多模态 file 部分，便于主模型纯文本重试。
 */
async function fallbackHistoryWithVisionHelper(opts: {
  history: ModelMessage[];
  userId: string;
  question: string;
}): Promise<{ history: ModelMessage[]; describedCount: number }> {
  const question =
    opts.question.trim() ||
    "请完整提取图片中的全部文字（OCR），并简要描述图片内容。若无文字则只描述画面。";
  let describedCount = 0;
  const next: ModelMessage[] = [];

  for (const message of opts.history) {
    if (message.role !== "user" || typeof message.content === "string") {
      next.push(message);
      continue;
    }
    const content = message.content;
    if (!Array.isArray(content)) {
      next.push(message);
      continue;
    }

    const fileParts = content.filter(
      (part) =>
        part &&
        typeof part === "object" &&
        "type" in part &&
        (part as { type?: string }).type === "file"
    );
    if (fileParts.length === 0) {
      next.push(message);
      continue;
    }

    const textParts = content.filter(
      (part) =>
        part &&
        typeof part === "object" &&
        "type" in part &&
        (part as { type?: string }).type === "text"
    );
    const baseText = textParts
      .map((part) => ("text" in part ? String(part.text ?? "") : ""))
      .join("\n")
      .trim();

    const descriptions: string[] = [];
    for (let i = 0; i < fileParts.length; i++) {
      const part = fileParts[i] as {
        data?: { type?: string; data?: string; url?: URL | string };
        mediaType?: string;
      };
      try {
        let source = "";
        if (part.data?.type === "data" && typeof part.data.data === "string") {
          const mime = part.mediaType || "image/png";
          source = `data:${mime};base64,${part.data.data}`;
        } else if (part.data?.type === "url" && part.data.url) {
          source = String(part.data.url);
        }
        if (!source) {
          descriptions.push(`图片${i + 1}：无法读取`);
          continue;
        }
        const { buffer, mime } = await bufferFromImageSource(source);
        const text = await describeImageFromBuffer(
          opts.userId,
          buffer,
          mime,
          question
        );
        describedCount += 1;
        descriptions.push(`图片${i + 1}识别结果：\n${text}`);
      } catch (e) {
        descriptions.push(
          `图片${i + 1}识别失败：${e instanceof Error ? e.message : "未知错误"}`
        );
      }
    }

    next.push({
      role: "user",
      content: [
        baseText || "请看这张图片。",
        "（原生视觉内联失败，已改用辅助识图模型读取图片：）",
        ...descriptions,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
  }

  return { history: next, describedCount };
}

function getPlainTextFromParts(parts: MessagePart[]) {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function buildToolRoutingContext(
  messages: Array<typeof schema.messages.$inferSelect>
) {
  const recent = messages.slice(-6);
  const recentMessages = recent.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const text = getPlainTextFromParts(message.parts as MessagePart[])
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    return text ? [{ role: message.role, text }] : [];
  });
  const recentParts = recent.flatMap(
    (message) => (message.parts as MessagePart[] | null | undefined) ?? []
  );
  const recentToolNames = Array.from(
    new Set(
      recentParts.flatMap((part) =>
        part.type === "tool-call" && part.toolName ? [part.toolName] : []
      )
    )
  );
  const recentFileNames = Array.from(
    new Set(
      recentParts.flatMap((part) => (part.type === "file" ? [part.name] : []))
    )
  );
  const hasRecentCode =
    recentToolNames.includes("run_code") ||
    recentMessages.some((message) =>
      /```|(?:代码|脚本|程序|JavaScript|TypeScript|Python|SQL)/iu.test(message.text)
    );

  return {
    recentMessages,
    recentImageCount: recentParts.filter((part) => part.type === "image").length,
    recentFileNames,
    recentToolNames,
    hasRecentCode,
  };
}

async function loadProjectKnowledgeBaseIds(projectId: string, userId: string) {
  const rows = await db
    .select({ id: schema.projectKnowledgeBases.knowledgeBaseId })
    .from(schema.projectKnowledgeBases)
    .innerJoin(
      schema.knowledgeBases,
      eq(schema.projectKnowledgeBases.knowledgeBaseId, schema.knowledgeBases.id)
    )
    .where(
      and(
        eq(schema.projectKnowledgeBases.projectId, projectId),
        eq(schema.knowledgeBases.ownerId, userId)
      )
    );
  return rows.map((row) => row.id);
}

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
  thinkingEffort?: ThinkingEffort;
  toolToggles?: ChatToolToggles;
  /** 重新生成时选择模型只是本次重试，不覆盖会话后续默认模型。 */
  persistModel?: boolean;
  userId: string;
  origin: string;
  emit: (e: StreamEvent) => void;
  signal: AbortSignal;
}) {
  const { conversationId, parentId, assistantId, modelId, userId, origin, emit, signal } =
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
  const [existingAssistant] = await db
    .select({
      conversationId: schema.messages.conversationId,
      parentId: schema.messages.parentId,
      role: schema.messages.role,
    })
    .from(schema.messages)
    .where(eq(schema.messages.id, assistantId))
    .limit(1);
  if (
    existingAssistant &&
    (existingAssistant.conversationId !== conversationId ||
      existingAssistant.parentId !== parentId ||
      existingAssistant.role !== "assistant")
  ) {
    throw new Error("助手消息 ID 冲突");
  }
  if (existingAssistant) {
    await db
      .update(schema.messages)
      .set({ modelId: effectiveModelId, parts: [], status: "streaming", usage: null })
      .where(eq(schema.messages.id, assistantId));
  } else {
    await db.insert(schema.messages).values({
      id: assistantId,
      conversationId,
      parentId,
      role: "assistant",
      modelId: effectiveModelId,
      parts: [],
      status: "streaming",
    });
  }
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
  const modelCanReceiveInlineImages = resolvedChatModel
    ? shouldInlineVisionInput(resolvedChatModel)
    : false;
  const modelSupportsTools = resolvedChatModel
    ? (resolvedChatModel.record.capabilities as string[]).includes("tools")
    : false;
  /** 内联解析失败（或缺视觉）时才需要挂 analyze_image 降级 */
  let visionHelperNeeded = false;
  /** 本轮历史是否含原生内联图片（用于请求失败后立刻辅助识图重试） */
  let historyHasInlineVision = false;

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
  const currentUserMessage = chain[chain.length - 1];
  const currentUserText =
    currentUserMessage?.role === "user"
      ? getPlainTextFromParts(currentUserMessage.parts as MessagePart[])
      : "";
  const toolRoutingContext = buildToolRoutingContext(chain.slice(0, -1));
  let shouldPrioritizeKnowledgeTool =
    isKnowledgeDirectedQuery(currentUserText) ||
    (toolRoutingContext.recentToolNames.includes("search_knowledge") &&
      isContextualKnowledgeFollowUp(currentUserText));
  let shouldPrioritizeCodeRunner =
    isCodeExecutionDirectedQuery(currentUserText) ||
    (toolRoutingContext.hasRecentCode && isContextualCodeFollowUp(currentUserText));
  let shouldPrioritizeImageGeneration =
    isImageGenerationDirectedQuery(currentUserText) ||
    (toolRoutingContext.recentImageCount > 0 &&
      isContextualImageFollowUp(currentUserText));

  let history: ModelMessage[] = [];
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
    let text = getPlainTextFromParts(msgParts);
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
        text += `\n\n<attached_file id="${f.attachmentId}" name="${att.name}">\n${att.text.slice(0, 30_000)}\n</attached_file>`;
      } else {
        text += `\n\n（用户上传了文件「${f.name}」，attachmentId=${f.attachmentId}，内容无法解析）`;
      }
    }

    const imageParts = msgParts.filter((p): p is ImagePart => p.type === "image");
    if (m.role === "user" && imageParts.length > 0) {
      const imageUrls = imageParts
        .map((img, i) => `图片${i + 1}: ${img.url}`)
        .join("\n");
      const editImageHint = `\n\n（用户上传的图片路径：\n${imageUrls}\n如果用户要求编辑、修改、换背景或调整图片，请调用 edit_image，并把对应路径作为 imageUrl。）`;
      if (modelCanReceiveInlineImages) {
        const resolvedImages = await Promise.all(
          imageParts.map((img) => tryResolveHistoryImageSource(img.url, origin))
        );
        const imageSrcs = resolvedImages.flatMap((result) =>
          result.ok ? [result.source] : []
        );
        const failedImages = imageParts.filter((_, i) => !resolvedImages[i]?.ok);
        const imageErrors = resolvedImages.flatMap((result) =>
          result.ok ? [] : [result.message]
        );
        if (failedImages.length > 0) {
          visionHelperNeeded = true;
        }
        const failedPaths = failedImages
          .map((img, i) => `图片${i + 1}: ${img.url}`)
          .join("\n");
        const imageErrorText =
          failedImages.length > 0
            ? `\n\n（有 ${failedImages.length} 张图片无法内联：${Array.from(new Set(imageErrors)).join("；")}。若需要读取这些图片，请调用 analyze_image，路径：\n${failedPaths}）`
            : "";
        if (imageSrcs.length > 0) {
          historyHasInlineVision = true;
          history.push({
            role: "user",
            content: [
              ...imageSrcs.map(toModelImageFilePart),
              {
                type: "text" as const,
                text: (text || "请看这张图片。") + imageErrorText + editImageHint,
              },
            ],
          });
        } else {
          history.push({
            role: "user",
            content:
              (text || "用户上传了图片。") +
              `\n\n（图片无法内联：${Array.from(new Set(imageErrors)).join("；") || "图片无效"}。请调用 analyze_image 读取：\n${imageUrls}）` +
              editImageHint,
          });
        }
      } else {
        // 无视觉能力：提示调用 analyze_image / edit_image；本地路径原样传给工具。
        visionHelperNeeded = true;
        history.push({
          role: "user",
          content: `${text}\n\n（用户上传了图片，你无法直接查看。若用户询问图片内容，请调用 analyze_image；若用户要求编辑图片，请调用 edit_image。图片路径：\n${imageUrls}）`,
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
      // 助手生图未内联进多模态消息；无视觉，或用户本轮在追问视觉细节时，降级挂 analyze_image
      const needHelperForAssistantImage =
        !modelHasVision || isVisionDirectedQuery(currentUserText);
      if (needHelperForAssistantImage) {
        visionHelperNeeded = true;
        history.push({
          role: "assistant",
          content: `${text || "已生成图片。"}\n\n（助手生成的图片：\n${imageUrls}\n如需分析视觉细节，请调用 analyze_image 读取对应路径。）`,
        });
      } else {
        history.push({
          role: "assistant",
          content: `${text || "已生成图片。"}\n\n（助手生成的图片：\n${imageUrls}）`,
        });
      }
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

  // 系统提示词：小林基础行为 + 风格 + Skill + 项目指令 + 记忆 + 工具规则
  let system = buildBaseSystemPrompt();
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
  let projectKnowledgeBaseIds: string[] = [];
  if (conv?.projectId) {
    projectKnowledgeBaseIds = await loadProjectKnowledgeBaseIds(
      conv.projectId,
      userId
    );
    if (
      projectKnowledgeBaseIds.length > 0 &&
      isProjectMaterialDirectedQuery(currentUserText)
    ) {
      shouldPrioritizeKnowledgeTool = true;
    }
  }

  let activeSkill: typeof schema.skills.$inferSelect | undefined;
  // Skill：旧提示词技能覆盖任务角色但保留平台基础规则；Skill Pack 叠加运行时说明和能力清单
  if (conv?.skillId) {
    const [skill] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, conv.skillId));
    if (skill) {
      activeSkill = skill;
      if (skill.kind === "pack") {
        system += `\n\n${composeSkillPackPrompt(skill)}`;
      } else {
        system += `\n\n<active_skill>\n以下指令定义当前会话的任务角色和专业行为：\n${skill.systemPrompt}\n</active_skill>`;
      }
    }
  }

  const routing = await resolveToolRouting({
    userId,
    conversationId,
    userMessageId: parentId,
    userText: currentUserText,
    messageParts: (currentUserMessage?.parts as MessagePart[] | undefined) ?? [],
    requestedTools: opts.toolToggles,
    projectKnowledgeBaseIds,
    isProjectConversation: !!conv?.projectId,
    activeSkillId: activeSkill?.id,
    context: toolRoutingContext,
    signal,
  });
  if (routing.decision.enabled) {
    shouldPrioritizeCodeRunner ||=
      routing.decision.selectedBuiltins.includes("codeRunner");
    shouldPrioritizeImageGeneration ||=
      routing.decision.selectedBuiltins.includes("imageGeneration");
    shouldPrioritizeKnowledgeTool ||=
      routing.decision.selectedBuiltins.includes("knowledgeSearch");
  }
  if (signal.aborted) return;

  let routedSkill: typeof schema.skills.$inferSelect | undefined;
  if (!activeSkill && routing.selectedSkillIds.length > 0) {
    const [skill] = await db
      .select()
      .from(schema.skills)
      .where(
        and(
          eq(schema.skills.id, routing.selectedSkillIds[0]),
          eq(schema.skills.kind, "pack"),
          eq(schema.skills.reviewStatus, "approved"),
          or(eq(schema.skills.ownerId, userId), eq(schema.skills.visibility, "public"))
        )
      )
      .limit(1);
    if (skill) {
      routedSkill = skill;
      system += `\n\n${composeSkillPackPrompt(skill)}`;
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
    if (projectKnowledgeBaseIds.length > 0) {
      system +=
        "\n\n本项目已关联长期知识库。项目文件会直接作为项目资料提供；关联知识库需要通过 search_knowledge 按需检索。";
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

  // 工具集：智能路由默认关闭；关闭时由具体工具开关直接决定是否挂载。
  let allowedToggles = mergeSkillToggles(opts.toolToggles, activeSkill);
  let toggles = mergeSkillToggles(routing.finalTools, activeSkill);
  const enabledBuiltins = { ...routing.enabledBuiltins };
  applySkillBuiltinPlan(enabledBuiltins, activeSkill, toggles);
  if (routedSkill) {
    allowedToggles = mergeSkillToggles(allowedToggles, routedSkill);
    toggles = mergeSkillToggles(toggles, routedSkill);
    applySkillBuiltinPlan(enabledBuiltins, routedSkill, toggles);
  }
  // 保留意图兜底逻辑，便于未来重新启用智能路由时复用；当前手动模式下
  // enabledBuiltins 已经由具体工具开关直接开启。
  if (allowedToggles.codeRunner && shouldPrioritizeCodeRunner) {
    enabledBuiltins.codeRunner = true;
    toggles.codeRunner = true;
  }
  if (allowedToggles.imageGeneration && shouldPrioritizeImageGeneration) {
    enabledBuiltins.imageGeneration = true;
    toggles.imageGeneration = true;
  }
  if (allowedToggles.knowledgeSearch && shouldPrioritizeKnowledgeTool) {
    enabledBuiltins.knowledgeSearch = true;
    toggles.knowledgeSearch = true;
  }
  const effectiveRoutingDecision = {
    ...routing.decision,
    finalTools: toggles,
    selectedBuiltins: builtinsFromEnabledPlan(enabledBuiltins),
    selectedSkillIds: routedSkill
      ? [routedSkill.id]
      : routing.decision.selectedSkillIds,
  };
  try {
    await persistToolRoutingDecision(
      conversationId,
      parentId,
      opts.toolToggles,
      effectiveRoutingDecision
    );
    emit({
      type: "routing-decision",
      messageId: parentId,
      decision: effectiveRoutingDecision,
    });
  } catch {
    // 路由展示信息落库失败不阻塞主对话。
  }

  const codeRunnerEnabled = enabledBuiltins.codeRunner && toggles.codeRunner;
  const knowledgeSearchEnabled =
    enabledBuiltins.knowledgeSearch && toggles.knowledgeSearch;
  const imageGenerationEnabled =
    enabledBuiltins.imageGeneration && toggles.imageGeneration;
  const selectedKnowledgeBaseIds = toggles?.knowledgeBaseIds ?? [];
  const effectiveKnowledgeBaseIds = Array.from(
    new Set([...(projectKnowledgeBaseIds ?? []), ...selectedKnowledgeBaseIds])
  );
  const isProjectConversation = !!conv?.projectId;
  const hasKnowledgeSearchScope =
    !isProjectConversation || effectiveKnowledgeBaseIds.length > 0;
  const knowledgeSearchMounted =
    knowledgeSearchEnabled && hasKnowledgeSearchScope;
  const describeToolState = (allowed: boolean, mounted: boolean) =>
    !allowed ? "关闭" : mounted ? "开启，已挂载" : "允许，但当前未挂载";
  system += `

LinHub 工具状态（回答工具能力或开关问题时必须以此为准）：
- 联网搜索：${describeToolState(allowedToggles.webSearch, enabledBuiltins.webSearch)}
- 图像生成：${describeToolState(allowedToggles.imageGeneration, imageGenerationEnabled)}
- 代码运行：${describeToolState(allowedToggles.codeRunner, codeRunnerEnabled)}
- 资料检索：${describeToolState(allowedToggles.knowledgeSearch, knowledgeSearchMounted)}
“允许，但当前未挂载”表示缺少当前会话所需的范围或依赖，不等于用户关闭。只有状态为“关闭”时，才能说用户关闭了对应能力。`;
  if (codeRunnerEnabled) {
    system +=
      "\n\n工具选择规则：当用户要求运行、执行、验证代码，或明确要求调用代码运行工具时，必须先调用 run_code，等待工具结果后再给结论；不要在工具返回前猜测、手算、复述旧结果或用 web_search 代替本地代码运行。run_code 在无网络的 gVisor 沙盒中支持 Python、Node.js 和 Bash；输入附件位于 /workspace/input，需交付的文件写入 /workspace/output。对 Excel/CSV 等表格先用 analyze_spreadsheet 获取结构，再用 run_code 完成复杂分析。";
  } else if (!allowedToggles.codeRunner && shouldPrioritizeCodeRunner) {
    system +=
      "\n\n代码运行规则：本轮用户要求运行、执行、验证代码，或明确要求调用代码运行工具，但用户已关闭代码运行。不要用 web_search、知识库或手算结果冒充运行结果；请说明当前无法调用代码运行工具，并提示用户开启代码运行后重试。可以给出代码片段供用户自行运行，但必须明确它尚未在 LinHub 中执行。";
  }
  if (knowledgeSearchEnabled && shouldPrioritizeKnowledgeTool) {
    if (isProjectConversation && !hasKnowledgeSearchScope) {
      system +=
        "\n\n资料检索规则：本会话在项目内，但当前项目未关联知识库，且本轮未额外选择知识库。不要为了补位而检索全部知识库；若项目文件内容足够，请直接基于项目文件回答，否则说明当前项目没有可检索的知识库资料。";
    } else if (isProjectConversation) {
      system +=
        "\n\n资料检索规则：本轮用户在询问知识库、项目资料、已上传文档、报告、资料或附件。项目文件内容已直接提供；若上下文不足或用户点名知识库，必须先调用 search_knowledge 检索项目关联或本轮选择的知识库。不要用 web_search 或 search_memory 替代私有资料检索。";
    } else {
      system +=
        "\n\n知识库检索规则：本轮用户在询问知识库、已上传文档、报告、资料或附件。必须先调用 search_knowledge 检索用户私有知识库；不要用 web_search 或 search_memory 替代。若检索无结果，再如实说明没有在知识库中找到；只有用户同时明确要求查公开网页时，才在知识库检索之后补充联网搜索。";
    }
  } else if (!allowedToggles.knowledgeSearch && shouldPrioritizeKnowledgeTool) {
    system +=
      "\n\n知识库检索规则：本轮用户在询问知识库、项目资料、已上传文档、报告、资料或附件，但用户已关闭知识库检索。不要用 web_search 或 search_memory 替代私有知识库；请说明当前无法读取知识库，并提示用户开启知识库检索后重试。";
  }
  if (imageGenerationEnabled && shouldPrioritizeImageGeneration) {
    system +=
      "\n\n图像生成规则：本轮用户要求生成或编辑图片。必须调用 generate_image 或 edit_image；不要用 create_artifact、update_artifact、SVG、HTML、Markdown、代码或文字描述冒充图片结果。只有用户明确要求 SVG/HTML/React/Canvas/代码作品/矢量图时，才改用 Artifact。";
  } else if (!allowedToggles.imageGeneration && shouldPrioritizeImageGeneration) {
    system +=
      "\n\n图像生成规则：本轮用户要求生成或编辑图片，但用户已关闭图像生成。不要调用 create_artifact、update_artifact，也不要用 SVG、HTML、Markdown、代码、ASCII 图、prompt 或文字描述冒充图片结果；请说明当前无法调用图像生成工具，并提示用户开启图像生成后重试。";
  }
  if (enabledBuiltins.artifacts) {
    system +=
      "\n\nArtifact 规则：当用户要求生成或更新 SVG、Logo、品牌标识、矢量图、HTML、React、Canvas、Mermaid、完整页面、组件或代码作品时，必须调用 create_artifact 或 update_artifact。SVG/Logo/品牌标识优先使用 kind=\"svg\"，content 必须是完整 <svg>...</svg>。不要在聊天正文输出完整 SVG/HTML/React 源码；最终回复只需简短说明已创建或已更新，并引导用户在右侧 Artifact 面板查看。";
  }
  const pendingImages: string[] = [];
  let tools: ToolSet = {};
  let closeMcp: (() => Promise<void>) | undefined;
  if (enabledBuiltins.webSearch) Object.assign(tools, buildWebTools(userId));
  if (enabledBuiltins.webSearch) {
    system +=
      "\n\n联网搜索规则：优先用少量高质量来源完成核查；一旦已有足够证据，必须停止继续调用搜索/读取工具并直接给出最终回答。";
  }
  if (codeRunnerEnabled) {
    Object.assign(
      tools,
      buildCodeTools(userId, {
        conversationId,
        messageId: assistantId,
        modelId: effectiveModelId,
      })
    );
    system +=
      "\n\n代码沙盒规则：普通执行、验证和小文件处理使用 run_code，默认 30 秒；处理数据或压缩包时主动设为 120 秒。只有预计超过 120 秒、较大压缩包/数据集或用户需要可刷新恢复的进度卡时才使用 start_code_lab。压缩文件先校验成员路径、文件数和解压后总大小，解压到 /tmp；交付文件必须写入 /workspace/output。";
  }
  if (enabledBuiltins.spreadsheet) Object.assign(tools, buildSpreadsheetTools(userId));
  if (imageGenerationEnabled)
    Object.assign(
      tools,
      buildImageTools(userId, (url) => pendingImages.push(url), origin)
    );
  // 原生 vision 且内联成功：不挂 analyze_image；无视觉或内联失败时再降级挂载
  const mountVisionHelper =
    enabledBuiltins.vision && (!modelHasVision || visionHelperNeeded);
  if (mountVisionHelper) Object.assign(tools, buildVisionTool(userId, origin));
  if (
    enabledBuiltins.artifacts &&
    !(shouldPrioritizeImageGeneration && !imageGenerationEnabled)
  ) {
    Object.assign(tools, buildArtifactTools(conversationId));
  }
  if (enabledBuiltins.memory) {
    Object.assign(tools, buildMemoryTools(userId, conversationId, conv?.projectId));
  }
  if (knowledgeSearchMounted) {
    Object.assign(tools, buildKnowledgeTool(userId, effectiveKnowledgeBaseIds));
  }
  const toolSkill = activeSkill?.kind === "pack" ? activeSkill : routedSkill;
  let mountPptxTools = enabledBuiltins.pptx;
  if (toolSkill?.kind === "pack") {
    Object.assign(
      tools,
      buildSkillPackTools(toolSkill, userId, {
        conversationId,
        messageId: assistantId,
        modelId: effectiveModelId,
      })
    );
    const skillTools = new Set([
      ...((toolSkill.enabledTools ?? []) as string[]),
      ...((toolSkill.requiredTools ?? []) as string[]),
    ]);
    mountPptxTools =
      mountPptxTools ||
      toolSkill.id === "skill-pptx-native" ||
      skillTools.has("pptx_extract_text") ||
      skillTools.has("pptx_create_deck") ||
      skillTools.has("dashi_render_deck");
  }
  // PPTX 也可由附件/文本意图直接启用；不能要求当前会话必须先进入 Pack Skill，
  // 否则关闭智能路由时虽已选中 pptx builtin，却只会挂载通用表格工具。
  if (mountPptxTools) {
    Object.assign(tools, buildPptxTools(userId));
    system +=
      "\n\nPPTX 工具规则：当用户上传或引用 .pptx 附件时，必须优先调用 pptx_extract_text 或 pptx_analyze_template；不要用 analyze_spreadsheet 处理 PPTX。生成新演示文稿时调用 pptx_create_deck，并在最终回答里给出下载说明。";
  }
  try {
    const mcp = await buildMcpTools(userId, toggles?.mcpServerIds ?? []);
    Object.assign(tools, mcp.tools);
    closeMcp = mcp.close;
    if (mcp.mountedServers.length > 0) {
      const mcpSummary = mcp.mountedServers
        .map(
          (server) =>
            `- ${server.name}：已挂载（${server.toolNames.join("、") || "未发现工具"}）`
        )
        .join("\n");
      const hasMcpWebTool = mcp.mountedServers.some((server) =>
        server.toolNames.some((name) => /(?:search|reader|web_read|zread)/iu.test(name))
      );
      system += `

MCP 工具状态（这些是当前模型可直接调用的真实工具）：
${mcpSummary}
回答“有哪些工具”“能否联网/读取网页”等能力问题时，必须把上述 MCP 计入，不得只枚举 LinHub 内置工具。`;
      if (hasMcpWebTool) {
        system +=
          "\n已挂载的 MCP 中包含联网搜索或网页读取工具；即使内置联网搜索开关关闭，也不能声称当前无法联网。用户要求搜索或读取网页时，应调用合适的 MCP 工具。";
      }
    }
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
    const providerOptions: Record<string, JSONObject> = {};
    const openaiProviderOptions: JSONObject = {};
    const anthropicProviderOptions: JSONObject = {};
    const thinkingEffort = normalizeThinkingEffort(opts.thinkingEffort);
    const sdkReasoningEffort = toSdkReasoningEffort(thinkingEffort);
    const providerReasoningEffort =
      provider.kind === "openai"
        ? toOpenAIReasoningEffort(thinkingEffort)
        : sdkReasoningEffort;
    const modelSupportsReasoning = (record.capabilities as string[]).includes("reasoning");
    const reasoning = modelSupportsReasoning
      ? opts.extendedThinking
        ? providerReasoningEffort
        : "none"
      : undefined;
    if (provider.kind === "openai") {
      if (modelSupportsReasoning) {
        openaiProviderOptions.reasoningEffort = opts.extendedThinking
          ? toOpenAIReasoningEffort(thinkingEffort)
          : "minimal";
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
    if (Object.keys(openaiProviderOptions).length > 0) {
      providerOptions.openai = openaiProviderOptions;
    }
    if (provider.kind === "anthropic" && modelSupportsReasoning && opts.extendedThinking) {
      anthropicProviderOptions.effort = toAnthropicReasoningEffort(thinkingEffort);
    }
    if (Object.keys(anthropicProviderOptions).length > 0) {
      providerOptions.anthropic = anthropicProviderOptions;
    }

    let activeHistory = history;
    let visionFallbackAttempted = false;
    let followupInputTokens = 0;
    let followupOutputTokens = 0;
    let result!: ReturnType<typeof streamText>;

    // 优先原生内联；若网关/模型处理图片失败且尚未产出可见内容，立刻辅助识图并重试一次
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = streamText({
          model,
          system,
          messages: activeHistory,
          abortSignal: signal,
          ...(record.maxOutputTokens ? { maxOutputTokens: record.maxOutputTokens } : {}),
          ...(hasTools && modelSupportsTools
            ? { tools, stopWhen: stepCountIs(MAX_TOOL_STEPS) }
            : {}),
          ...(reasoning ? { reasoning } : {}),
          ...(Object.keys(providerOptions).length > 0
            ? { providerOptions }
            : {}),
          // MCP/联网工具不能无限等待；长任务按工具单独放宽，避免 Code Lab/PPT 被
          // 普通 WebReader 的超时预算误杀。
          timeout: {
            totalMs: CHAT_TOTAL_TIMEOUT_MS,
            toolMs: DEFAULT_TOOL_TIMEOUT_MS,
            tools: LONG_RUNNING_TOOL_TIMEOUTS,
          },
        });
        streamResult = result;

        let reasoningStart = 0;
        const toolParts = new Map<string, ToolCallPart>();
        const fallbackToolResults: string[] = [];
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
            if (last?.type === "reasoning") {
              last.text = sanitizeReasoningText(last.text);
            }
            if (last?.type === "reasoning" && last.text.trim().length > 0) {
              last.durationMs = Math.max(0, duration);
              emit({
                type: "reasoning-done",
                messageId: assistantId,
                durationMs: last.durationMs,
              });
              await persistPartial(true);
            } else if (last?.type === "reasoning") {
              parts.pop();
              await persistPartial(true);
            }
          } else if (chunk.type === "text-delta") {
            appendDelta(parts, "text", chunk.text);
            emit({ type: "text-delta", messageId: assistantId, delta: chunk.text });
            await persistPartial();
          } else if (chunk.type === "tool-input-start") {
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
            await persistPartial();
          } else if (chunk.type === "tool-input-delta") {
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
            const existing = toolParts.get(chunk.toolCallId);
            if (existing) {
              existing.args = (chunk.input ?? {}) as Record<string, unknown>;
              existing.inputPreview = undefined;
              emit({ type: "tool-call-start", messageId: assistantId, part: { ...existing } });
              await persistPartial(true);
            } else {
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
              const fallbackToolText = formatRawToolOutputForFallback(
                part.toolName,
                chunk.output
              );
              if (fallbackToolText) fallbackToolResults.push(fallbackToolText);
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

        const hasVisibleOutput = parts.some(
          (part) =>
            (part.type === "text" && part.text.trim().length > 0) ||
            part.type === "image"
        );
        const toolSummary = (
          fallbackToolResults.length > 0
            ? fallbackToolResults.join("\n\n")
            : formatToolCallsAsText(
                parts.filter((p): p is ToolCallPart => p.type === "tool-call")
              )
        ).slice(0, 12_000);
        if (!hasVisibleOutput && toolSummary) {
          try {
            const fallbackMaxOutputTokens = Math.min(
              record.maxOutputTokens ?? 1200,
              1200
            );
            await assertCanSpend(
              userId,
              computeCostCents(record, {
                inputTokens:
                  estimatePromptTokens(system, activeHistory) +
                  Math.ceil(toolSummary.length / 4),
                outputTokens: Math.min(fallbackMaxOutputTokens, 256),
              })
            );
            const fallback = await generateText({
              model,
              system:
                system +
                "\n\n你现在不能再调用工具。必须基于已经获得的工具结果，直接给出用户可见的最终回答；如果证据不足，要明确说明。",
              messages: [
                ...activeHistory,
                {
                  role: "assistant",
                  content: `我已经调用工具得到以下结果：\n\n${toolSummary}`,
                },
                {
                  role: "user",
                  content:
                    "请基于上述工具结果，直接回答我最新的问题。使用中文，保留关键来源名称或链接，不要再请求调用工具。",
                },
              ],
              abortSignal: signal,
              maxOutputTokens: fallbackMaxOutputTokens,
              ...(Object.keys(openaiProviderOptions).length > 0
                ? { providerOptions: { openai: openaiProviderOptions } }
                : {}),
            });
            followupInputTokens = fallback.usage.inputTokens ?? 0;
            followupOutputTokens = fallback.usage.outputTokens ?? 0;
            const text = fallback.text.trim();
            if (text.length > 0) {
              if (signal.aborted) {
                const abortError = new Error("Aborted");
                abortError.name = "AbortError";
                throw abortError;
              }
              appendDelta(parts, "text", text);
              emit({ type: "text-delta", messageId: assistantId, delta: text });
              await persistPartial(true);
            }
          } catch (e) {
            if (signal.aborted || (e instanceof Error && e.name === "AbortError")) {
              throw e;
            }
            if (e instanceof Error && e.name === "BillingError") {
              status = "error";
              const errorText = `⚠️ ${e.message}`;
              appendDelta(parts, "text", errorText);
              emit({ type: "text-delta", messageId: assistantId, delta: errorText });
              await persistPartial(true);
            }
          }
        }

        break;
      } catch (streamErr) {
        if (signal.aborted || (streamErr instanceof Error && streamErr.name === "AbortError")) {
          throw streamErr;
        }
        const raw = getErrorMessage(streamErr);
        const hasVisiblePartial = parts.some(
          (part) =>
            (part.type === "text" && part.text.trim().length > 0) ||
            part.type === "image"
        );
        const canVisionFallback =
          attempt === 0 &&
          !visionFallbackAttempted &&
          historyHasInlineVision &&
          !hasVisiblePartial &&
          isInlineVisionRequestError(raw);

        if (!canVisionFallback) throw streamErr;

        visionFallbackAttempted = true;
        try {
          const real = await Promise.race([
            streamResult?.usage,
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error("timeout")), 2000)
            ),
          ]);
          if (real && ((real.inputTokens ?? 0) > 0 || (real.outputTokens ?? 0) > 0)) {
            await recordUsage(
              userId,
              record,
              conversationId,
              {
                inputTokens: real.inputTokens ?? 0,
                outputTokens: real.outputTokens ?? 0,
                costCents: computeCostCents(record, {
                  inputTokens: real.inputTokens ?? 0,
                  outputTokens: real.outputTokens ?? 0,
                }),
              },
              { allowDebt: true, capability: "chat" }
            );
          }
        } catch {
          // 失败请求用量不可用时跳过
        }

        const notice = "原生视觉内联失败，正在改用辅助识图模型…\n\n";
        parts.length = 0;
        appendDelta(parts, "text", notice);
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
            status: "streaming",
          },
        });
        emit({ type: "text-delta", messageId: assistantId, delta: notice });
        await persistPartial(true);

        const fallback = await fallbackHistoryWithVisionHelper({
          history: activeHistory,
          userId,
          question: currentUserText,
        });
        if (fallback.describedCount === 0) throw streamErr;

        activeHistory = fallback.history;
        history = activeHistory;
        parts.length = 0;
        emit({
          type: "assistant-snapshot",
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
        await persistPartial(true);
        continue;
      }
    }

    const sanitizedFinalOutput = sanitizeAssistantOutputParts(parts);
    if (sanitizedFinalOutput) {
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
        },
      });
      await persistPartial(true);
    }

    const hasAnyVisibleOutput = parts.some(
      (part) =>
        (part.type === "text" && part.text.trim().length > 0) ||
        part.type === "image"
    );

    if (parts.length === 0 || !hasAnyVisibleOutput) {
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
    const inputTokens = (finalUsage.inputTokens ?? 0) + followupInputTokens;
    const outputTokens = (finalUsage.outputTokens ?? 0) + followupOutputTokens;
    usage = {
      inputTokens,
      outputTokens,
      costCents: computeCostCents(record, { inputTokens, outputTokens }),
    };

    // 计费落库
    await recordUsage(userId, record, conversationId, usage, {
      allowDebt: true,
      capability: "chat",
    });
    await closeMcp?.();
    if (status === "streaming") status = "complete";
  } catch (e) {
    await closeMcp?.();
    const billPartialUsage = async () => {
      const record = resolvedChatModel?.record;
      if (!record) return;
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        const real = await Promise.race([
          streamResult?.usage,
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("timeout")), 2000)
          ),
        ]);
        inputTokens = real?.inputTokens ?? 0;
        outputTokens = real?.outputTokens ?? 0;
      } catch {
        const historyChars = history.reduce(
          (n, m) =>
            n + (typeof m.content === "string" ? m.content.length : 500),
          system.length
        );
        const outputChars = parts.reduce(
          (n, p) =>
            n + ("text" in p && typeof p.text === "string" ? p.text.length : 0),
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
        await recordUsage(userId, record, conversationId, usage, {
          allowDebt: true,
          capability: "chat",
        });
      }
    };

    if (signal.aborted || (e instanceof Error && e.name === "AbortError")) {
      status = "stopped";
      // 中止也要为已产生的 token 计费（C3：防逃单）
      try {
        await billPartialUsage();
      } catch {
        // 中止计费失败不阻塞消息落库
      }
    } else {
      status = "error";
      // 非 abort 错误同样入账，避免中途失败逃单
      try {
        await billPartialUsage();
      } catch {
        // 错误计费失败不阻塞消息落库
      }
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

  if (status === "stopped" || status === "error") {
    const settled = settleRunningToolParts(
      parts,
      status === "stopped" ? "生成已停止，可重新生成。" : "工具调用随生成失败而中断。"
    );
    parts.splice(0, parts.length, ...settled);
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

function normalizeThinkingEffort(effort?: ThinkingEffort): ThinkingEffort {
  if (
    effort === "minimal" ||
    effort === "low" ||
    effort === "medium" ||
    effort === "high" ||
    effort === "xhigh" ||
    effort === "max"
  ) {
    return effort;
  }
  return "high";
}

function toSdkReasoningEffort(effort: ThinkingEffort): SdkReasoningEffort {
  return effort === "max" ? "xhigh" : effort;
}

function toOpenAIReasoningEffort(effort: ThinkingEffort): SdkReasoningEffort {
  return effort === "max" || effort === "xhigh" ? "high" : effort;
}

function toAnthropicReasoningEffort(
  effort: ThinkingEffort
): "low" | "medium" | "high" | "xhigh" | "max" {
  if (effort === "minimal") return "low";
  return effort;
}

function summarizeToolResult(output: unknown): ToolResultSummary {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    const summary: ToolResultSummary = {};
    if (Array.isArray(o.sources)) summary.sources = o.sources as ToolResultSummary["sources"];
    if (Array.isArray(o.images)) summary.images = o.images as string[];
    if (Array.isArray(o.attachments)) {
      summary.attachments = o.attachments as ToolResultSummary["attachments"];
    }
    if (typeof o.name === "string") summary.name = o.name;
    if (Array.isArray(o.sheets)) {
      summary.sheets = o.sheets.slice(0, 12) as ToolResultSummary["sheets"];
    }
    if (typeof o.slideCount === "number" && Number.isFinite(o.slideCount)) {
      summary.slideCount = o.slideCount;
    }
    if (Array.isArray(o.slides)) {
      summary.slides = o.slides.slice(0, 60) as ToolResultSummary["slides"];
    }
    if (Array.isArray(o.layouts)) {
      summary.layouts = o.layouts.slice(0, 60) as ToolResultSummary["layouts"];
    }
    if (typeof o.artifactId === "string") summary.artifactId = o.artifactId;
    if (typeof o.artifactTitle === "string") summary.artifactTitle = o.artifactTitle;
    if (typeof o.skillRunId === "string") summary.skillRunId = o.skillRunId;
    if (typeof o.skillName === "string") summary.skillName = o.skillName;
    if (typeof o.timedOut === "boolean") summary.timedOut = o.timedOut;
    if (typeof o.stdoutStderrLimitExceeded === "boolean") {
      summary.stdoutStderrLimitExceeded = o.stdoutStderrLimitExceeded;
    }
    if (typeof o.outputLimitExceeded === "boolean") {
      summary.outputLimitExceeded = o.outputLimitExceeded;
    }
    if (typeof o.consolePreviewTruncated === "boolean") {
      summary.consolePreviewTruncated = o.consolePreviewTruncated;
    }
    if (typeof o.exitCode === "number" || o.exitCode === null) {
      summary.exitCode = o.exitCode;
    }
    if (typeof o.durationMs === "number" && Number.isFinite(o.durationMs)) {
      summary.durationMs = o.durationMs;
    }
    if (typeof o.answer === "string") summary.text = o.answer;
    else if (typeof o.text === "string") {
      const sandboxWasLimited =
        o.timedOut === true ||
        o.stdoutStderrLimitExceeded === true ||
        o.outputLimitExceeded === true ||
        o.consolePreviewTruncated === true;
      if (sandboxWasLimited) {
        const statusLines: string[] = [];
        for (const line of o.text.split("\n")) {
          if (/^(?:stdout|stderr):/u.test(line)) break;
          statusLines.push(line);
        }
        summary.text =
          statusLines.join("\n").slice(0, 500) ||
          "代码沙盒执行完成，控制台预览已省略";
      } else {
        summary.text = o.text.slice(0, 500);
      }
    }
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
      (source) =>
        `- ${source.title}\n  URL: ${source.url}${
          source.snippet ? `\n  摘要: ${source.snippet}` : ""
        }`
    );
    const images = result.images?.map((url) => `- 图片: ${url}`);
    const attachments = result.attachments?.map(
      (file) => `- 附件：${file.name}\n  URL: ${file.url}`
    );
    const text = result.text ? [`- ${result.text}`] : [];
    const detail = [
      ...text,
      ...(chunks ?? []),
      ...(sources ?? []),
      ...(images ?? []),
      ...(attachments ?? []),
    ]
      .join("\n")
      .slice(0, 2000);
    return detail
      ? [`此前工具「${part.toolName}」结果摘要：\n${detail}`]
      : [];
  });
  return lines.join("\n\n");
}

function formatRawToolOutputForFallback(toolName: string, output: unknown) {
  const detail = formatRawToolOutputDetail(output).slice(0, 4000);
  return detail ? `工具「${toolName}」结果：\n${detail}` : "";
}

function formatRawToolOutputDetail(output: unknown): string {
  if (!output || typeof output !== "object") return String(output ?? "");

  const o = output as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof o.answer === "string") lines.push(`回答：\n${o.answer}`);
  if (typeof o.text === "string") lines.push(`文本：\n${o.text.slice(0, 2500)}`);
  if (Array.isArray(o.sources)) {
    const sourceLines = o.sources
      .slice(0, 12)
      .map(formatFallbackSource)
      .filter(Boolean);
    if (sourceLines.length > 0) lines.push(`来源：\n${sourceLines.join("\n")}`);
  }
  if (Array.isArray(o.chunks)) {
    const chunkLines = o.chunks
      .slice(0, 8)
      .map(formatFallbackChunk)
      .filter(Boolean);
    if (chunkLines.length > 0) lines.push(`知识库片段：\n${chunkLines.join("\n")}`);
  }
  if (Array.isArray(o.images)) {
    const images = o.images
      .filter((url): url is string => typeof url === "string")
      .slice(0, 4)
      .map((url) => `- 图片：${url}`);
    if (images.length > 0) lines.push(images.join("\n"));
  }
  if (Array.isArray(o.attachments)) {
    const attachments = o.attachments
      .filter((file): file is Record<string, unknown> => !!file && typeof file === "object")
      .slice(0, 4)
      .map((file) => {
        const name = typeof file.name === "string" ? file.name : "附件";
        const url = typeof file.url === "string" ? file.url : "";
        return `- 附件：${name}${url ? `\n  URL: ${url}` : ""}`;
      });
    if (attachments.length > 0) lines.push(attachments.join("\n"));
  }
  if (lines.length > 0) return lines.join("\n\n");
  return JSON.stringify(toJsonValue(output)).slice(0, 2500);
}

function formatFallbackSource(source: unknown) {
  if (!source || typeof source !== "object") return "";
  const s = source as Record<string, unknown>;
  const title = typeof s.title === "string" ? s.title : "来源";
  const url = typeof s.url === "string" ? s.url : "";
  const snippet = typeof s.snippet === "string" ? s.snippet : "";
  return `- ${title}${url ? `\n  URL: ${url}` : ""}${
    snippet ? `\n  摘要: ${snippet}` : ""
  }`;
}

function formatFallbackChunk(chunk: unknown) {
  if (!chunk || typeof chunk !== "object") return "";
  const c = chunk as Record<string, unknown>;
  const name = typeof c.documentName === "string" ? c.documentName : "知识库";
  const index =
    typeof c.chunkIndex === "number" || typeof c.chunkIndex === "string"
      ? `#${c.chunkIndex}`
      : "";
  const snippet = typeof c.snippet === "string" ? c.snippet : "";
  return snippet ? `- ${name}${index}: ${snippet}` : "";
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
  if (/Maximum call stack size exceeded/i.test(message)) {
    return "图片/多模态请求处理失败：当前模型网关处理这张图片时异常。请压缩图片后重试，或切换支持视觉输入的模型/辅助识图模型。";
  }
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
  if (/Maximum call stack size exceeded|invalid image|unsupported|validation|zod|tool|图片|文件|multimodal/i.test(message)) {
    return false;
  }
  return /api key|unauthorized|forbidden|401|403|authentication|permission|no such model|model .*not found|供应商|未配置 API Key|模型不可用/i.test(
    message
  );
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

function sanitizeAssistantOutputParts(parts: MessagePart[]) {
  let changed = false;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.type === "text") {
      const cleaned = sanitizeAssistantText(part.text);
      if (cleaned !== part.text) {
        changed = true;
        if (cleaned) {
          part.text = cleaned;
        } else {
          parts.splice(i, 1);
        }
      }
    } else if (part.type === "reasoning") {
      const cleaned = sanitizeReasoningText(part.text);
      if (cleaned !== part.text) {
        changed = true;
        if (cleaned) {
          part.text = cleaned;
        } else {
          parts.splice(i, 1);
        }
      }
    }
  }
  return changed;
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

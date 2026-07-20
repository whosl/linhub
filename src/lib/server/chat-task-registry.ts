import type { StreamEvent } from "@/lib/types";

export type ChatEmit = (event: StreamEvent) => void;

export interface ChatSubscriber {
  emit: ChatEmit;
  close: () => void;
}

export interface ChatGenerationTask {
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

export const chatTasks = (globalChatState.__linhubChatTasks ??= new Map());
export const chatTasksByClientId = (globalChatState.__linhubChatTasksByClientId ??=
  new Map());
export const canceledClientIds = (globalChatState.__linhubCanceledClientIds ??=
  new Set());
export const pendingGenerationKeys =
  (globalChatState.__linhubPendingGenerationKeys ??= new Map());

export const PENDING_GENERATION_STALE_MS = 1_800_000;

export function isLiveTask(task: ChatGenerationTask | undefined, userId?: string) {
  return (
    !!task &&
    !task.done &&
    !task.abortController.signal.aborted &&
    (!userId || task.userId === userId)
  );
}

export function clientGenerationKey(userId: string, clientGenerationId: string) {
  return `${userId}:${clientGenerationId}`;
}

export function abortConversationGeneration(conversationId: string, userId: string) {
  const task = chatTasks.get(conversationId);
  if (!isLiveTask(task, userId)) return false;
  task.abortController.abort();
  if (!task.assistantStarted) task.canceledBeforeStart = true;
  return true;
}

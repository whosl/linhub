// 聊天相关端点:流式发送 / 续传 / 停止 / 重新生成 / 反馈 / 会话+消息加载

import { ApiError, getToken, setToken, UNAUTHORIZED_EVENT, request } from "./http";
import { streamNdjson } from "./ndjson";
import type {
  ChatToolToggles,
  Conversation,
  FilePart,
  ImagePart,
  Message,
  StreamEvent,
} from "./types";

/** 幂等锚点 ID:前缀 + 16 位 hex(与后端约定一致) */
export function clientId(prefix: "c" | "msg" | "cg"): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export type ThinkingEffort =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/** POST /api/chat 普通发送的 body */
export interface SendMessageInput {
  text: string;
  /** 已有会话 id;新会话省略(由 clientConversationId 预生成) */
  conversationId?: string;
  /** 幂等锚点,"cg-"+16hex */
  clientGenerationId?: string;
  /** 新会话预生成 id,"c-"+16hex */
  clientConversationId?: string;
  clientUserMessageId?: string;
  clientAssistantMessageId?: string;
  /** 父消息 id(消息树) */
  parentId?: string;
  attachments?: FilePart[];
  images?: ImagePart[];
  quotedText?: string;
  modelId?: string;
  styleId?: string;
  extendedThinking: boolean;
  thinkingEffort?: ThinkingEffort;
  tools: ChatToolToggles;
  projectId?: string;
  skillId?: string;
}

/** POST /api/chat 重新生成的 body */
export interface RegenerateInput {
  regenerate: true;
  clientGenerationId: string;
  clientAssistantMessageId?: string;
  conversationId: string;
  /** 要重新生成的 assistant 消息 id */
  assistantMessageId: string;
  modelId?: string;
}

/** 流式请求共用:带 Bearer 的 fetch(不走 request() 的超时/JSON 封装) */
async function streamFetch(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, signal, credentials: "include" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "网络错误,请检查连接后重试");
  }
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new ApiError(401, "登录已过期,请重新登录");
  }
  return res;
}

/** 发送消息,返回事件流(消费方负责迭代) */
export async function sendMessage(
  input: SendMessageInput,
  signal?: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>> {
  const res = await streamFetch(
    "/api/chat",
    { method: "POST", body: JSON.stringify(input) },
    signal,
  );
  return streamNdjson<StreamEvent>(res);
}

/** 重新生成指定 assistant 消息(新分支),返回事件流 */
export async function regenerate(
  input: RegenerateInput,
  signal?: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>> {
  const res = await streamFetch(
    "/api/chat",
    { method: "POST", body: JSON.stringify(input) },
    signal,
  );
  return streamNdjson<StreamEvent>(res);
}

/** 订阅进行中的生成流(页面刷新 / 其他标签页发起的生成) */
export async function resumeStream(
  conversationId: string,
  signal?: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>> {
  const res = await streamFetch(
    `/api/chat?conversationId=${encodeURIComponent(conversationId)}`,
    { method: "GET" },
    signal,
  );
  return streamNdjson<StreamEvent>(res);
}

/** 停止生成(服务端随后不会再发 done) */
export async function stopGeneration(conversationId: string): Promise<void> {
  await request(`/api/chat?conversationId=${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
}

export async function setFeedback(
  messageId: string,
  feedback: "up" | "down" | null,
): Promise<void> {
  await request(`/api/messages/${encodeURIComponent(messageId)}/feedback`, {
    method: "POST",
    body: { feedback },
  });
}

/** 局部重绘成功后替换消息中某个 image part 的 url */
export async function updateMessageImage(
  messageId: string,
  body: { oldUrl: string; newUrl: string; editPrompt?: string },
): Promise<void> {
  await request(`/api/messages/${encodeURIComponent(messageId)}/image`, {
    method: "PATCH",
    body,
  });
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

export async function getConversationWithMessages(
  id: string,
): Promise<ConversationWithMessages> {
  return request<ConversationWithMessages>(
    `/api/conversations/${encodeURIComponent(id)}`,
  );
}

// Skill Run 相关端点:快照 / 停止 / 重试 / 提交输入 / SSE 事件订阅

import { ApiError, getToken, setToken, UNAUTHORIZED_EVENT, request } from "./http";
import { streamSse, type SseEvent } from "./sse";
import type { Message } from "./types";

export interface SkillRunStep {
  id: string;
  runId: string;
  parentStepId?: string;
  kind: "coordinator" | "subagent" | "tool" | "approval" | "artifact";
  label: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  sourceCount?: number;
  attempt?: number;
  modelId?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SkillRunResultAttachment {
  id: string;
  name: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface SkillRunSnapshot {
  id: string;
  conversationId: string;
  messageId?: string;
  skillId?: string;
  kind: string;
  skillName: string;
  status: "queued" | "running" | "waiting_input" | "completed" | "failed" | "cancelled";
  stageLabel?: string;
  progress?: number;
  input?: unknown;
  steps: SkillRunStep[];
  resultAttachments?: SkillRunResultAttachment[];
  sourceCount?: number;
  completionReceiptStatus?: "pending" | "generating" | "completed" | "failed";
  completionMessageId?: string;
  completionMessage?: Message;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function getSkillRun(id: string): Promise<SkillRunSnapshot> {
  return request<SkillRunSnapshot>(`/api/skill-runs/${encodeURIComponent(id)}`);
}

/** 停止运行(取消) */
export async function stopSkillRun(id: string): Promise<void> {
  await request(`/api/skill-runs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** 重试失败 / 已取消的运行 */
export async function retrySkillRun(id: string): Promise<void> {
  await request(`/api/skill-runs/${encodeURIComponent(id)}`, { method: "POST" });
}

/** waiting_input 状态下提交用户输入(如 PPT 简报需求表单) */
export async function submitSkillRunInput(id: string, payload: unknown): Promise<void> {
  await request(`/api/skill-runs/${encodeURIComponent(id)}/input`, {
    method: "POST",
    body: payload,
  });
}

/** 带鉴权的 SSE fetch(与 chat.ts 的 streamFetch 同款,不走 request() 的 JSON 封装) */
async function sseFetch(path: string, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, { method: "GET", headers, signal, credentials: "include" });
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

/**
 * 订阅运行的 SSE 事件流,产出原始 SseEvent(event: snapshot / run-event / ping)。
 * 消费方负责在终态后停止迭代(组件卸载时通过 signal 断开)。
 */
export async function streamSkillRunEvents(
  runId: string,
  signal?: AbortSignal,
): Promise<AsyncGenerator<SseEvent>> {
  const res = await sseFetch(
    `/api/skill-runs/${encodeURIComponent(runId)}/events`,
    signal,
  );
  return streamSse(res);
}

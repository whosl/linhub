import { request } from "./http";
import type { Conversation } from "./types";

/** 会话列表(可选搜索词) */
export async function listConversations(q?: string): Promise<Conversation[]> {
  const path = q ? `/api/conversations?q=${encodeURIComponent(q)}` : "/api/conversations";
  const data = await request<Conversation[] | { conversations: Conversation[] }>(path);
  // 兼容数组或包裹结构
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.conversations)) return data.conversations;
  return [];
}

export interface ConversationPatch {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
  currentLeafId?: string;
}

export async function patchConversation(
  id: string,
  patch: ConversationPatch,
): Promise<Conversation | null> {
  return request<Conversation | null>(`/api/conversations/${id}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await request(`/api/conversations/${id}`, { method: "DELETE" });
}

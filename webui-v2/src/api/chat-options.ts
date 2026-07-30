// 聊天输入区所需的选项类端点:回复风格 / 知识库 / MCP / 个人默认模型

import { request } from "./http";
import type { ChatStyle, User } from "./types";

/** 回复风格列表(内置 + 个人) */
export async function getStyles(): Promise<ChatStyle[]> {
  return request<ChatStyle[]>("/api/styles");
}

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  description?: string;
  documentCount?: number;
}

/** 知识库列表(工具面板多选用) */
export async function getKnowledgeBases(): Promise<KnowledgeBaseItem[]> {
  return request<KnowledgeBaseItem[]>("/api/knowledge");
}

export interface McpServerItem {
  id: string;
  scope: "global" | "user";
  name: string;
  url: string;
  transport?: string;
  enabled: boolean;
  defaultEnabled: boolean;
  status?: string;
  tools?: { name: string; description?: string }[];
}

/** MCP 服务器列表:scope=global(自动启用)或 scope=user(逐台开关) */
export async function getMcpServers(
  scope: "global" | "user",
): Promise<McpServerItem[]> {
  return request<McpServerItem[]>(`/api/mcp?scope=${scope}`);
}

/** 更新个人资料(目前仅用于"设为默认模型") */
export async function patchMe(patch: {
  defaultModelId?: string | null;
  name?: string;
}): Promise<User | null> {
  return request<User | null>("/api/me", { method: "PATCH", body: patch });
}

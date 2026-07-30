// 设置(Settings)API:账户资料 / 记忆 / 回复风格 / MCP 连接器 / 数据导出
import { request, requestBlob } from "./http";
import type { ChatStyle, User } from "./types";

export type { ChatStyle };

export interface MemoryEntry {
  id: string;
  content: string;
  sourceConversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StyleInput {
  /** 带 id 视为更新(后端若不支持 id 更新,会按新建处理) */
  id?: string;
  name: string;
  description?: string;
  prompt?: string;
}

export interface McpTool {
  name: string;
  description?: string;
}

export interface McpServer {
  id: string;
  scope: string;
  name: string;
  url: string;
  transport: "sse" | "streamable-http";
  headersMasked?: Record<string, string>;
  enabled: boolean;
  status: "connected" | "error" | "unknown";
  tools?: McpTool[];
}

export interface McpServerInput {
  id?: string;
  name: string;
  url: string;
  transport: "sse" | "streamable-http";
  enabled?: boolean;
  headers?: Record<string, string>;
}

export interface McpTestResult {
  ok: boolean;
  tools?: McpTool[];
  error?: string;
}

export const settingsKeys = {
  memories: ["settings", "memories"] as const,
  styles: ["settings", "styles"] as const,
  mcp: ["settings", "mcp"] as const,
};

/** 更新当前用户资料(昵称等) */
export function updateMe(patch: {
  name?: string;
  avatarUrl?: string;
  defaultModelId?: string;
}): Promise<User> {
  return request<User>("/api/me", { method: "PATCH", body: patch });
}

export function getMemories(): Promise<MemoryEntry[]> {
  return request<MemoryEntry[]>("/api/memories");
}

export function createMemory(content: string): Promise<MemoryEntry> {
  return request<MemoryEntry>("/api/memories", {
    method: "POST",
    body: { content },
  });
}

export function deleteMemory(id: string): Promise<void> {
  return request<void>(`/api/memories/${id}`, { method: "DELETE" });
}

export function getStyles(): Promise<ChatStyle[]> {
  return request<ChatStyle[]>("/api/styles");
}

export function saveStyle(input: StyleInput): Promise<ChatStyle> {
  return request<ChatStyle>("/api/styles", { method: "POST", body: input });
}

export function deleteStyle(id: string): Promise<void> {
  return request<void>(`/api/styles/${id}`, { method: "DELETE" });
}

export function getMcpServers(): Promise<McpServer[]> {
  return request<McpServer[]>("/api/mcp?scope=user");
}

/** 保存 MCP 连接器(带 id 为更新;启停 toggle 也走此接口) */
export function saveMcpServer(input: McpServerInput): Promise<McpServer> {
  return request<McpServer>("/api/mcp", {
    method: "POST",
    body: { ...input, scope: "user" },
  });
}

export function deleteMcpServer(id: string): Promise<void> {
  return request<void>(`/api/mcp/${id}`, { method: "DELETE" });
}

export function testMcpServer(id: string): Promise<McpTestResult> {
  return request<McpTestResult>(`/api/mcp/${id}/test`, { method: "POST" });
}

/** 导出账户数据:拉取 JSON Blob 并触发浏览器下载 */
export async function downloadAccountExport(): Promise<void> {
  const blob = await requestBlob("/api/account/export", { method: "GET" });
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `linhub-export-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

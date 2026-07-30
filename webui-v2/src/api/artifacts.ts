// Artifact 相关端点:列表 / 详情 / 分享 / 公开分享内容

import { request } from "./http";

export interface ArtifactVersion {
  version: number;
  content: string;
  createdAt: string;
}

export type ArtifactKind = "html" | "react" | "svg" | "markdown" | "code" | "mermaid";

export interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  kind: ArtifactKind;
  language?: string;
  versions: ArtifactVersion[];
  currentVersion: number;
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
}

/** queryKey ["artifacts", conversationId];聊天流 artifact 事件会 invalidate 它 */
export async function listArtifacts(conversationId: string): Promise<Artifact[]> {
  return request<Artifact[]>(
    `/api/artifacts?conversationId=${encodeURIComponent(conversationId)}`,
  );
}

export async function getArtifact(id: string): Promise<Artifact> {
  return request<Artifact>(`/api/artifacts/${encodeURIComponent(id)}`);
}

/** 生成(或复用)分享 token */
export async function shareArtifact(id: string): Promise<{ shareToken: string }> {
  return request<{ shareToken: string }>(
    `/api/artifacts/${encodeURIComponent(id)}/share`,
    { method: "POST" },
  );
}

/** 公开分享内容(无需登录;silent401 避免公开页触发全局跳转) */
export async function getSharedArtifact(token: string): Promise<Artifact> {
  return request<Artifact>(
    `/api/artifacts/shared/${encodeURIComponent(token)}`,
    { silent401: true },
  );
}

// 项目(Projects)相关端点与类型 —— 本页功能私有类型,避免改动共享 types.ts

import { request } from "./http";

export interface ProjectFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface ProjectKbRef {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  totalChunks: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  modelId?: string | null;
  knowledgeBaseIds: string[];
  knowledgeBases: ProjectKbRef[];
  createdAt: string;
  updatedAt: string;
  conversationCount: number;
  files: ProjectFile[];
}

/** 项目下的会话(与 GET /api/projects/{id}/conversations 契约一致) */
export interface ProjectConversation {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  updatedAt: string;
  createdAt: string;
  projectId?: string;
  modelId?: string;
  currentLeafId?: string;
}

/** 知识库摘要(GET /api/knowledge,用于项目内勾选关联) */
export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  totalChunks: number;
}

export interface ProjectCreateInput {
  name: string;
  description?: string;
  color?: string;
}

export interface ProjectPatch {
  name?: string;
  description?: string;
  instructions?: string;
  color?: string;
  /** 传 null 表示清除项目默认模型(跟随全局默认) */
  modelId?: string | null;
  knowledgeBaseIds?: string[];
}

export const projectsKey = ["projects"] as const;
export const projectKey = (id: string) => ["projects", id] as const;
export const projectConversationsKey = (id: string) =>
  ["projects", id, "conversations"] as const;
/** 独立 key:避免与聊天工具面板 ["knowledge-bases"](类型无 totalChunks)冲突 */
export const knowledgeListKey = ["knowledge", "all"] as const;

export async function listProjects(): Promise<Project[]> {
  return request<Project[]>("/api/projects");
}

export async function getProject(id: string): Promise<Project> {
  return request<Project>(`/api/projects/${id}`);
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  return request<Project>("/api/projects", { method: "POST", body: input });
}

export async function patchProject(
  id: string,
  patch: ProjectPatch,
): Promise<Project> {
  return request<Project>(`/api/projects/${id}`, { method: "PATCH", body: patch });
}

export async function deleteProject(id: string): Promise<void> {
  await request(`/api/projects/${id}`, { method: "DELETE" });
}

export async function listProjectConversations(
  id: string,
): Promise<ProjectConversation[]> {
  return request<ProjectConversation[]>(`/api/projects/${id}/conversations`);
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseSummary[]> {
  return request<KnowledgeBaseSummary[]>("/api/knowledge");
}

/** 删除项目文件(附件) */
export async function deleteAttachment(fileId: string): Promise<void> {
  await request(`/api/attachments/${fileId}`, { method: "DELETE" });
}

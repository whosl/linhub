// 技能(Skills)API:我的技能 / 技能广场 / 详情 / 保存 / 删除
import { request } from "./http";

export interface SkillResource {
  id: string;
  name: string;
  kind?: string;
  description?: string;
  path?: string;
  mimeType?: string;
  size?: number;
}

export interface Skill {
  id: string;
  ownerId: string;
  name: string;
  slug?: string;
  emoji: string;
  description: string;
  systemPrompt: string;
  kind: "prompt" | "pack";
  version: number;
  source?: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
  requiredTools: string[];
  resourceRefs: SkillResource[];
  scriptPolicy?: {
    enabled: boolean;
    allowedScripts?: string[];
    timeoutMs?: number;
    network?: boolean;
  };
  reviewStatus: "draft" | "pending" | "approved" | "rejected";
  greeting?: string;
  defaultModelId?: string;
  enabledTools: string[];
  knowledgeBaseIds: string[];
  visibility: "private" | "pending" | "public";
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 新建 / 更新技能的请求体(带 id 为更新;shareToMarket=true 提交后进入待审核) */
export interface SkillInput {
  id?: string;
  name: string;
  emoji?: string;
  description?: string;
  systemPrompt?: string;
  greeting?: string;
  defaultModelId?: string;
  shareToMarket?: boolean;
}

export const skillKeys = {
  mine: ["skills", "mine"] as const,
  market: ["skills", "market"] as const,
  detail: (id: string) => ["skills", "detail", id] as const,
};

export function getMySkills(): Promise<Skill[]> {
  return request<Skill[]>("/api/skills");
}

export function getMarketSkills(): Promise<Skill[]> {
  return request<Skill[]>("/api/skills?market=1");
}

export function getSkill(id: string): Promise<Skill> {
  return request<Skill>(`/api/skills/${id}`);
}

export function saveSkill(input: SkillInput): Promise<Skill> {
  return request<Skill>("/api/skills", { method: "POST", body: input });
}

export function deleteSkill(id: string): Promise<void> {
  return request<void>(`/api/skills/${id}`, { method: "DELETE" });
}

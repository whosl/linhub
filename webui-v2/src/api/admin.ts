// 管理后台 API:/api/admin/** + 全局 MCP(/api/mcp?scope=global)
// 全部需要 admin 权限;错误统一为 { error },由 http.ts 解析抛出

import { request } from "./http";

// ---------- 供应商 ----------

export type ProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "zhipu"
  | "deepseek"
  | "xiaomi"
  | "xiaomi-token-plan";

export interface AdminProvider {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl?: string;
  apiKeyMasked?: string;
  enabled: boolean;
  storeEnabled: boolean;
}

export interface AdminProviderInput {
  id?: string;
  kind: ProviderKind;
  name: string;
  /** 留空 = 不修改 */
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  storeEnabled?: boolean;
}

export interface RemoteModel {
  slug: string;
  displayName?: string;
  added: boolean;
}

// ---------- 模型 ----------

export type ModelCapability =
  | "vision"
  | "reasoning"
  | "tools"
  | "image-generation"
  | "web-search-native";

export type ModelTier = "free" | "pro";

export interface AdminModel {
  id: string;
  providerId: string;
  providerKind: ProviderKind;
  slug: string;
  displayName: string;
  description?: string;
  capabilities: string[];
  enabled: boolean;
  /** 整数分 / 百万 token */
  inputPricePerM: number;
  /** 整数分 / 百万 token */
  outputPricePerM: number;
  /** 整数分 / 张 */
  pricePerImage?: number;
  contextWindow: number;
  maxOutputTokens?: number;
  tier: ModelTier;
  sortOrder?: number;
}

export interface AdminModelInput {
  id?: string;
  providerId: string;
  slug: string;
  displayName: string;
  description?: string;
  capabilities: string[];
  enabled: boolean;
  inputPricePerM: number;
  outputPricePerM: number;
  pricePerImage?: number;
  contextWindow: number;
  maxOutputTokens?: number;
  tier: ModelTier;
  sortOrder?: number;
}

// ---------- 套餐 ----------

export interface AdminPlan {
  id: string;
  name: string;
  description: string;
  /** 整数分 / 月 */
  priceCentsPerMonth: number;
  /** 整数分;-1 = 无限 */
  monthlyQuotaCents: number;
  modelTier: ModelTier;
  features: string[];
  enabled: boolean;
}

export interface AdminPlanInput {
  id?: string;
  name: string;
  description: string;
  priceCentsPerMonth: number;
  monthlyQuotaCents: number;
  modelTier: ModelTier;
  features: string[];
  enabled: boolean;
}

// ---------- 用户 ----------

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  /** 余额(分),两种字段名都兼容 */
  balanceCents?: number;
  balance?: number;
  createdAt: string;
  subscription?: {
    planId: string;
    planName: string;
    expiresAt: string;
  };
}

export interface UsageRecord {
  id: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  amountCents: number;
  balanceAfterCents: number;
  reason: string;
  description: string;
  createdAt: string;
}

export interface AdminUserDetail {
  user: AdminUser;
  usageRecords: UsageRecord[];
  ledger: LedgerEntry[];
}

// ---------- 技能审核 ----------

export interface AdminSkill {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
  systemPrompt?: string;
  ownerId: string;
  reviewStatus: string;
}

// ---------- 系统设置 ----------

export interface AppSettings {
  siteName: string;
  defaultChatModelId?: string;
  visionHelperModelId?: string;
  toolRouterModelId?: string;
  embeddingModelId?: string;
  imageGenBaseUrl?: string;
  imageGenModel?: string;
  imageGenApiKeyMasked?: string;
  ttsBaseUrl?: string;
  ttsModel?: string;
  ttsApiKeyMasked?: string;
  mimoTtsVoice?: string;
  asrBaseUrl?: string;
  asrModel?: string;
  asrApiKeyMasked?: string;
  searchBaseUrl?: string;
  tavilyApiKeyMasked?: string;
  mimoApiKeyMasked?: string;
  skillMarketRequiresReview: boolean;
  registrationEnabled: boolean;
}

/** 保存设置时的 patch:可携带明文 key(留空 = 不修改) */
export interface AppSettingsPatch extends Partial<AppSettings> {
  tavilyApiKey?: string;
  mimoApiKey?: string;
  imageGenApiKey?: string;
  ttsApiKey?: string;
  asrApiKey?: string;
}

export type EngineKind = "image" | "tts" | "asr" | "search";

export interface EngineTestConfig {
  baseUrl?: string;
  model?: string;
  voice?: string;
  apiKey?: string;
}

export interface EngineTestResult {
  ok: boolean;
  error?: string;
}

/** 引擎测试超时:image 130s,其余 70s(http.ts timeoutMs 可配) */
export const ENGINE_TEST_TIMEOUT_MS: Record<EngineKind, number> = {
  image: 130_000,
  tts: 70_000,
  asr: 70_000,
  search: 70_000,
};

// ---------- 全局 MCP ----------

export interface GlobalMcpServer {
  id: string;
  name: string;
  url: string;
  transport?: string;
  enabled: boolean;
  defaultEnabled: boolean;
  status?: string;
  tools?: { name: string; description?: string }[];
}

export interface GlobalMcpInput {
  id?: string;
  name?: string;
  url?: string;
  transport?: string;
  enabled?: boolean;
  defaultEnabled?: boolean;
}

// ---------- query keys ----------

export const adminKeys = {
  providers: ["admin", "providers"] as const,
  remoteModels: (providerId: string) =>
    ["admin", "providers", providerId, "remote-models"] as const,
  models: ["admin", "models"] as const,
  plans: ["admin", "plans"] as const,
  users: ["admin", "users"] as const,
  userDetail: (id: string) => ["admin", "users", id] as const,
  skills: ["admin", "skills"] as const,
  settings: ["admin", "settings"] as const,
  mcpGlobal: ["admin", "mcp", "global"] as const,
};

// ---------- 供应商 API ----------

export async function getProviders(): Promise<AdminProvider[]> {
  return request<AdminProvider[]>("/api/admin/providers");
}

export async function saveProvider(
  input: AdminProviderInput,
): Promise<AdminProvider> {
  return request<AdminProvider>("/api/admin/providers", {
    method: "POST",
    body: input,
  });
}

export async function deleteProvider(id: string): Promise<void> {
  return request<void>(`/api/admin/providers/${id}`, { method: "DELETE" });
}

export async function getRemoteModels(
  providerId: string,
): Promise<RemoteModel[]> {
  return request<RemoteModel[]>(`/api/admin/providers/${providerId}/models`);
}

export async function addRemoteModels(
  providerId: string,
  slugs: string[],
): Promise<{ added: number }> {
  return request<{ added: number }>(
    `/api/admin/providers/${providerId}/models`,
    { method: "POST", body: { slugs } },
  );
}

// ---------- 模型 API ----------

export async function getAdminModels(): Promise<AdminModel[]> {
  return request<AdminModel[]>("/api/admin/models");
}

export async function saveModel(input: AdminModelInput): Promise<AdminModel> {
  return request<AdminModel>("/api/admin/models", {
    method: "POST",
    body: input,
  });
}

export async function deleteModel(id: string): Promise<void> {
  return request<void>(`/api/admin/models/${id}`, { method: "DELETE" });
}

export async function testModel(id: string): Promise<EngineTestResult> {
  return request<EngineTestResult>(`/api/admin/models/${id}/test`, {
    method: "POST",
    timeoutMs: 70_000,
  });
}

// ---------- 套餐 API ----------

export async function getPlans(): Promise<AdminPlan[]> {
  return request<AdminPlan[]>("/api/admin/plans");
}

export async function savePlan(input: AdminPlanInput): Promise<AdminPlan> {
  return request<AdminPlan>("/api/admin/plans", {
    method: "POST",
    body: input,
  });
}

export async function deletePlan(id: string): Promise<void> {
  return request<void>(`/api/admin/plans?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------- 用户 API ----------

export async function getAdminUsers(): Promise<AdminUser[]> {
  return request<AdminUser[]>("/api/admin/users");
}

export async function getAdminUserDetail(
  id: string,
): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/api/admin/users/${id}`);
}

/** 充值 / 赠送(amountCents 为整数分) */
export async function topUpUser(input: {
  userId: string;
  amountCents: number;
  note?: string;
}): Promise<void> {
  return request<void>("/api/admin/users", { method: "POST", body: input });
}

/** 修改订阅:planId 为 null 表示清除订阅 */
export async function updateUserSubscription(
  id: string,
  input: { planId: string | null; expiresInDays?: number },
): Promise<void> {
  return request<void>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteUser(id: string): Promise<void> {
  return request<void>(`/api/admin/users/${id}`, { method: "DELETE" });
}

// ---------- 技能审核 API ----------

export async function getPendingSkills(): Promise<AdminSkill[]> {
  return request<AdminSkill[]>("/api/admin/skills");
}

export async function reviewSkill(input: {
  id: string;
  approve: boolean;
}): Promise<void> {
  return request<void>("/api/admin/skills", { method: "POST", body: input });
}

// ---------- 系统设置 API ----------

export async function getSettings(): Promise<AppSettings> {
  return request<AppSettings>("/api/admin/settings");
}

export async function saveSettings(
  patch: AppSettingsPatch,
): Promise<AppSettings> {
  return request<AppSettings>("/api/admin/settings", {
    method: "POST",
    body: patch,
  });
}

export async function testEngine(
  engine: EngineKind,
  config: EngineTestConfig,
): Promise<EngineTestResult> {
  return request<EngineTestResult>("/api/admin/settings/engine-test", {
    method: "POST",
    body: { engine, config },
    timeoutMs: ENGINE_TEST_TIMEOUT_MS[engine],
  });
}

// ---------- 全局 MCP API ----------

export async function getGlobalMcpServers(): Promise<GlobalMcpServer[]> {
  return request<GlobalMcpServer[]>("/api/mcp?scope=global");
}

export async function saveGlobalMcp(
  input: GlobalMcpInput,
): Promise<GlobalMcpServer> {
  return request<GlobalMcpServer>("/api/mcp", {
    method: "POST",
    body: { ...input, scope: "global" },
  });
}

export async function deleteMcp(id: string): Promise<void> {
  return request<void>(`/api/mcp/${id}`, { method: "DELETE" });
}

export async function testMcp(id: string): Promise<EngineTestResult> {
  return request<EngineTestResult>(`/api/mcp/${id}/test`, {
    method: "POST",
    timeoutMs: 70_000,
  });
}

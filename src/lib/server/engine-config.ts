import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";

/**
 * 引擎配置读取层。
 * 每个能力域（图像/TTS/ASR/搜索）有独立的 baseURL + key + model，
 * 存在 settings 表里，不再混入 providers 表。
 * 新字段为空时回退到旧的 MiMo / Tavily 字段，保证平滑迁移。
 */

async function getSettings() {
  const [s] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"))
    .limit(1);
  return s;
}

async function getProviderSecret(kind: typeof schema.providers.$inferSelect.kind) {
  const [provider] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.kind, kind))
    .limit(1);
  return {
    apiKey: provider?.apiKeyEncrypted ? decryptSecret(provider.apiKeyEncrypted) : null,
    baseURL: provider?.baseUrl ?? null,
  };
}

async function getMimoProviderFallback() {
  const tokenPlan = await getProviderSecret("xiaomi-token-plan");
  const legacy = await getProviderSecret("xiaomi");
  return {
    apiKey: tokenPlan.apiKey ?? legacy.apiKey,
    baseURL:
      tokenPlan.baseURL ??
      "https://token-plan-cn.xiaomimimo.com/v1",
  };
}

async function getImageBillingRecord(slug?: string) {
  const isImageModel = (record: typeof schema.models.$inferSelect) =>
    (record.capabilities as string[]).includes("image-generation");
  if (slug) {
    const records = await db
      .select()
      .from(schema.models)
      .where(eq(schema.models.slug, slug));
    const imageRecord = records.find((record) => isImageModel(record) && record.enabled);
    if (imageRecord) return imageRecord;
    if (records.some(isImageModel)) {
      throw new Error("图像生成模型已禁用，请先在「模型与计价」中启用");
    }
    if (records.length > 0) {
      throw new Error("图像生成模型需要在「模型与计价」中标记为生图能力");
    }
    throw new Error("图像生成模型需要先添加到「模型与计价」并设置生图能力");
  }
  const rows = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.enabled, true));
  return rows.find(isImageModel) ?? null;
}

// ---------- 图像生成 ----------

export async function getImageGenConfig(): Promise<{
  apiKey: string;
  baseURL: string;
  model: string;
  /** 计费用：对应的 models 表记录（可能为 null，表示走 settings 新字段、无 models 记录） */
  record: typeof schema.models.$inferSelect | null;
}> {
  const s = await getSettings();
  if (!s) throw new Error("设置未初始化");

  // 优先读新字段
  if (s.imageGenApiKeyEncrypted) {
    // settings-only 引擎仍必须映射到一条 models 记录用于计费，避免免费生图。
    const requestedModel = s.imageGenModel?.trim() || undefined;
    const record = await getImageBillingRecord(requestedModel);
    if (!record) throw new Error("管理员尚未配置图像计费模型");
    return {
      apiKey: decryptSecret(s.imageGenApiKeyEncrypted),
      baseURL: s.imageGenBaseUrl || "https://api.openai.com/v1",
      model: requestedModel ?? record.slug,
      record,
    };
  }

  // 回退：查 providers 表里 capabilities 含 image-generation 的模型（旧逻辑）
  const { getImageModelConfig } = await import("@/lib/server/llm/tools");
  const legacy = await getImageModelConfig();
  return {
    apiKey: legacy.apiKey,
    baseURL: legacy.baseURL,
    model: legacy.record.slug,
    record: legacy.record,
  };
}

// ---------- TTS ----------

export async function getTtsConfig(): Promise<{
  apiKey: string;
  baseURL: string;
  model: string;
  voice: string;
}> {
  const s = await getSettings();
  if (!s) throw new Error("设置未初始化");
  const providerFallback = await getMimoProviderFallback();

  // 新字段优先
  const apiKeyEnc = s.ttsApiKeyEncrypted ?? s.mimoApiKeyEncrypted;
  const apiKey = apiKeyEnc ? decryptSecret(apiKeyEnc) : providerFallback.apiKey;
  if (!apiKey) throw new Error("管理员尚未配置 TTS API Key");

  return {
    apiKey,
    baseURL: s.ttsBaseUrl || providerFallback.baseURL,
    model: s.ttsModel || "mimo-v2.5-tts",
    // 有效音色：mimo_default / 冰糖 / 茉莉 / 苏打 / 白桦 / Mia / Chloe / Milo / Dean
    voice: s.mimoTtsVoice || "mimo_default",
  };
}

// ---------- ASR ----------

export async function getAsrConfig(): Promise<{
  apiKey: string;
  baseURL: string;
  model: string;
}> {
  const s = await getSettings();
  if (!s) throw new Error("设置未初始化");
  const providerFallback = await getMimoProviderFallback();

  // 新字段优先；ASR key 回退到 mimo key
  const apiKeyEnc = s.asrApiKeyEncrypted ?? s.mimoApiKeyEncrypted;
  const apiKey = apiKeyEnc ? decryptSecret(apiKeyEnc) : providerFallback.apiKey;
  if (!apiKey) throw new Error("管理员尚未配置 ASR API Key");

  return {
    apiKey,
    baseURL: s.asrBaseUrl || providerFallback.baseURL,
    model: s.asrModel || "mimo-v2.5-asr",
  };
}

// ---------- 联网搜索 ----------

export async function getSearchConfig(): Promise<{
  apiKey: string;
  baseURL: string;
}> {
  const s = await getSettings();
  if (!s) throw new Error("设置未初始化");

  // key：新字段（searchApiKeyEnc）目前复用 tavilyApiKeyEncrypted
  const apiKeyEnc = s.tavilyApiKeyEncrypted;
  if (!apiKeyEnc) throw new Error("管理员尚未配置 Tavily API Key");

  return {
    apiKey: decryptSecret(apiKeyEnc),
    // baseURL：新字段优先，回退到 .env
    baseURL: s.searchBaseUrl || process.env.TAVILY_BASE_URL || "https://api.tavily.com",
  };
}

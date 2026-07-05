import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";

export interface ResolvedModel {
  model: LanguageModel;
  record: typeof schema.models.$inferSelect;
  provider: typeof schema.providers.$inferSelect;
}

const DEFAULT_BASE_URLS: Record<string, string | undefined> = {
  openai: undefined,
  anthropic: undefined,
  google: undefined,
  deepseek: undefined,
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  xiaomi: "https://api.mimo.xiaomi.com/v1",
};

/** 根据 modelId 从数据库解析出可调用的 AI SDK 模型实例 */
export async function resolveModel(modelId: string): Promise<ResolvedModel> {
  const [record] = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.id, modelId))
    .limit(1);
  if (!record || !record.enabled) throw new Error(`模型不可用: ${modelId}`);

  const [provider] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.id, record.providerId))
    .limit(1);
  if (!provider || !provider.enabled) throw new Error("供应商未启用");
  if (!provider.apiKeyEncrypted) throw new Error(`供应商 ${provider.name} 未配置 API Key`);

  const apiKey = decryptSecret(provider.apiKeyEncrypted);
  const baseURL = provider.baseUrl || DEFAULT_BASE_URLS[provider.kind];

  switch (provider.kind) {
    case "openai":
      return {
        model: createOpenAI({ apiKey, baseURL })(record.slug),
        record,
        provider,
      };
    case "anthropic":
      return {
        model: createAnthropic({ apiKey, baseURL })(record.slug),
        record,
        provider,
      };
    case "google":
      return {
        model: createGoogleGenerativeAI({ apiKey, baseURL })(record.slug),
        record,
        provider,
      };
    case "deepseek":
      return {
        model: createDeepSeek({ apiKey, baseURL })(record.slug),
        record,
        provider,
      };
    // 智谱与小米走 OpenAI 兼容协议（chat completions）
    case "zhipu":
    case "xiaomi":
      return {
        model: createOpenAI({ apiKey, baseURL }).chat(record.slug),
        record,
        provider,
      };
    default:
      throw new Error(`未知供应商: ${provider.kind}`);
  }
}

/** 按模型单价计算费用（分） */
export function computeCostCents(
  record: typeof schema.models.$inferSelect,
  usage: { inputTokens: number; outputTokens: number; imageCount?: number }
): number {
  const inputCost = (usage.inputTokens / 1_000_000) * record.inputPricePerM;
  const outputCost = (usage.outputTokens / 1_000_000) * record.outputPricePerM;
  const imageCost = (usage.imageCount ?? 0) * (record.pricePerImage ?? 0);
  return Math.ceil(inputCost + outputCost + imageCost);
}

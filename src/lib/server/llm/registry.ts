import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { wrapLanguageModel, type LanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";
import {
  openaiReasoningMiddleware,
  sanitizeOpenAIChatStreamFetch,
} from "./openai-reasoning-middleware";

export interface ResolvedModel {
  model: LanguageModel;
  record: typeof schema.models.$inferSelect;
  provider: typeof schema.providers.$inferSelect;
  /** 该供应商是否启用 Responses API store 持久化（中转网关常需关闭） */
  storeEnabled: boolean;
}

const DEFAULT_BASE_URLS: Record<string, string | undefined> = {
  openai: undefined,
  anthropic: undefined,
  google: undefined,
  deepseek: undefined,
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  xiaomi: "https://api.mimo.xiaomi.com/v1",
  "xiaomi-token-plan": "https://token-plan-cn.xiaomimimo.com/v1",
};

export function getProviderBaseURL(provider: typeof schema.providers.$inferSelect) {
  return provider.baseUrl || DEFAULT_BASE_URLS[provider.kind];
}

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
  const baseURL = getProviderBaseURL(provider);
  // storeEnabled 仅对走 Responses API 的 openai 协议有意义；其余协议恒为 true
  const storeEnabled = provider.storeEnabled ?? true;

  switch (provider.kind) {
    case "openai": {
      // 推理模型（capabilities 含 reasoning）：官方 OpenAI 优先走默认
      // Responses API，以便 AI SDK 接收 reasoning summary。OpenAI 兼容中转常只在
      // Chat Completions 用 delta.reasoning/reasoning_content 回传思考过程，
      // 因此中转路径套一层 middleware 桥接成标准 reasoning 流事件。
      // 同时部分网关的 tool_calls 增量 delta 带 type/id/name 空串（见下），
      // 用 sanitizeOpenAIChatStreamFetch 在 fetch 层清洗 SSE，避免 zod 校验失败。
      // 官方 OpenAI + store 开启时优先保留默认 Responses API；AI SDK 会处理
      // reasoning summary。只有 OpenAI 兼容中转/关闭 store 的推理模型才强制 chat。
      const isReasoningModel = (record.capabilities as string[]).includes("reasoning");
      const shouldUseChatCompletionsForReasoning =
        isReasoningModel && (Boolean(baseURL) || !storeEnabled);
      if (shouldUseChatCompletionsForReasoning) {
        const client = createOpenAI({ apiKey, baseURL, fetch: sanitizeOpenAIChatStreamFetch() });
        const baseModel = client.chat(record.slug);
        return {
          model: wrapLanguageModel({
            model: baseModel,
            middleware: openaiReasoningMiddleware(),
          }),
          record,
          provider,
          storeEnabled,
        };
      }
      const client = createOpenAI({ apiKey, baseURL });
      return {
        model: client(record.slug),
        record,
        provider,
        storeEnabled,
      };
    }
    case "anthropic":
      return {
        model: createAnthropic({ apiKey, baseURL })(record.slug),
        record,
        provider,
        storeEnabled,
      };
    case "google":
      return {
        model: createGoogleGenerativeAI({ apiKey, baseURL })(record.slug),
        record,
        provider,
        storeEnabled,
      };
    case "deepseek":
      return {
        model: createDeepSeek({ apiKey, baseURL })(record.slug),
        record,
        provider,
        storeEnabled,
      };
    // 智谱与小米（含 token plan）走 OpenAI 兼容协议（chat completions）
    case "zhipu":
    case "xiaomi":
    case "xiaomi-token-plan":
      return {
        model: createOpenAI({ apiKey, baseURL }).chat(record.slug),
        record,
        provider,
        storeEnabled,
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

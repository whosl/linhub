import { eq } from "drizzle-orm";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { getProviderBaseURL, resolveModel } from "@/lib/server/llm/registry";
import { decryptSecret } from "@/lib/server/crypto";
import { formatUpstreamError } from "@/lib/server/upstream-error";

export const maxDuration = 30;

async function getProviderForTest(providerId: string) {
  const [provider] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.id, providerId))
    .limit(1);
  if (!provider) throw new Error("供应商不存在");
  if (!provider.apiKeyEncrypted) throw new Error("供应商未配置 API Key");
  return {
    provider,
    apiKey: decryptSecret(provider.apiKeyEncrypted),
    baseURL: getProviderBaseURL(provider),
  };
}

function buildLanguageModelForTest(
  model: typeof schema.models.$inferSelect,
  provider: typeof schema.providers.$inferSelect,
  apiKey: string,
  baseURL: string | undefined
): LanguageModel {
  switch (provider.kind) {
    case "openai":
      return createOpenAI({ apiKey, baseURL })(model.slug);
    case "anthropic":
      return createAnthropic({ apiKey, baseURL })(model.slug);
    case "google":
      return createGoogleGenerativeAI({ apiKey, baseURL })(model.slug);
    case "deepseek":
      return createDeepSeek({ apiKey, baseURL })(model.slug);
    case "zhipu":
    case "xiaomi":
    case "xiaomi-token-plan":
      return createOpenAI({ apiKey, baseURL }).chat(model.slug);
    default:
      throw new Error(`未知供应商: ${provider.kind}`);
  }
}

/** 测试单个模型是否可调用：按模型能力分流测试方式 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const [model] = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.id, id))
    .limit(1);
  if (!model) return Response.json({ error: "模型不存在" }, { status: 404 });

  const capabilities = model.capabilities as string[];
  const isImageModel = capabilities.includes("image-generation");

  try {
    const { provider, apiKey, baseURL } = await getProviderForTest(model.providerId);
    if (isImageModel) {
      // 图像模型：走 /images/generations 发最小请求。测试禁用模型时也应可用，
      // 所以这里不走 resolveModel（它会拦截 enabled=false）。
      const imageBaseURL = baseURL ?? "https://api.openai.com/v1";
      const res = await fetch(`${imageBaseURL}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.slug,
          prompt: "test",
          size: "1024x1024",
          n: 1,
        }),
      });
      if (!res.ok) {
        throw new Error(await formatUpstreamError(res, "生图测试失败"));
      }
      return Response.json({ ok: true, message: "图像模型测试成功（已生成 1 张测试图）" });
    }

    // 文本模型：发极简 ping。已启用模型优先复用真实聊天解析路径，
    // 避免 OpenAI reasoning / store / 中转 chat-completions 分流测试误报。
    const lm = model.enabled
      ? (await resolveModel(model.id)).model
      : buildLanguageModelForTest(model, provider, apiKey, baseURL);
    const { usage } = await generateText({
      model: lm,
      prompt: "hi",
      ...(model.maxOutputTokens
        ? { maxOutputTokens: Math.min(model.maxOutputTokens, 5) }
        : { maxOutputTokens: 5 }),
    });
    return Response.json({
      ok: true,
      message: `测试成功（输入 ${usage.inputTokens} / 输出 ${usage.outputTokens} tokens）`,
    });
  } catch (e) {
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : "测试失败",
    });
  }
}

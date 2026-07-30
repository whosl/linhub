import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";
import {
  modelResource,
  withAtomicBilling,
} from "@/lib/server/billing/capabilities";
import { computeCostCents } from "@/lib/server/llm/registry";

/**
 * 解析 embedding 模型：优先 settings.embeddingModelId 指定的模型，
 * 否则回退到 OpenAI/智谱供应商的默认 embedding 模型。
 * 统一走 OpenAI 兼容 embeddings 接口，维度固定 1536（与 pgvector 列一致）。
 */
async function resolveEmbeddingModel(): Promise<{
  model: ReturnType<ReturnType<typeof createOpenAI>["textEmbedding"]>;
  record: typeof schema.models.$inferSelect | null;
}> {
  const [s] = await db
    .select({ modelId: schema.settings.embeddingModelId })
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"));

  let provider: typeof schema.providers.$inferSelect | undefined;
  let record: typeof schema.models.$inferSelect | null = null;
  let slug = "text-embedding-3-small";

  if (s?.modelId) {
    const [row] = await db
      .select({ model: schema.models, provider: schema.providers })
      .from(schema.models)
      .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
      .where(eq(schema.models.id, s.modelId));
    if (row) {
      provider = row.provider;
      record = row.model;
      slug = row.model.slug;
    }
  }
  if (!provider) {
    const providers = await db.select().from(schema.providers);
    provider =
      providers.find((p) => p.kind === "openai" && p.apiKeyEncrypted) ??
      providers.find((p) => p.kind === "zhipu" && p.apiKeyEncrypted);
    if (provider?.kind === "zhipu") slug = "embedding-3";
  }
  if (!provider?.apiKeyEncrypted) {
    throw new Error("未配置 embedding 模型（需要 OpenAI 或智谱 API Key）");
  }

  const client = createOpenAI({
    apiKey: decryptSecret(provider.apiKeyEncrypted),
    baseURL: provider.baseUrl || undefined,
  });
  return { model: client.textEmbedding(slug), record };
}

function estimateEmbeddingTokens(texts: string[]) {
  return Math.ceil(texts.reduce((n, t) => n + Math.min(t.length, 8000), 0) / 4);
}

async function billEmbedding(
  userId: string | undefined,
  texts: string[],
  record: typeof schema.models.$inferSelect | null,
  run: () => Promise<number[][]>
): Promise<number[][]> {
  if (!userId || !record) return run();
  const inputTokens = estimateEmbeddingTokens(texts);
  const costCents = computeCostCents(record, { inputTokens, outputTokens: 0 });
  if (costCents <= 0) return run();
  return withAtomicBilling(
    userId,
    {
      capability: "embedding",
      resource: modelResource(record),
      units: { inputTokens },
      costCents,
    },
    run
  );
}

export async function embedText(
  text: string,
  opts?: { userId?: string }
): Promise<number[]> {
  const { model, record } = await resolveEmbeddingModel();
  const [embedding] = await billEmbedding(opts?.userId, [text], record, async () => {
    const { embedding } = await embed({
      model,
      value: text.slice(0, 8000),
      providerOptions: { openai: { dimensions: 1536 } },
    });
    return [embedding];
  });
  return embedding;
}

export async function embedTexts(
  texts: string[],
  opts?: { userId?: string }
): Promise<number[][]> {
  const { model, record } = await resolveEmbeddingModel();
  return billEmbedding(opts?.userId, texts, record, async () => {
    const { embeddings } = await embedMany({
      model,
      values: texts.map((t) => t.slice(0, 8000)),
      providerOptions: { openai: { dimensions: 1536 } },
    });
    return embeddings;
  });
}

/** 将长文本切块：约 1000 字符，重叠 150，按段落边界优先 */
export function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current.length + p.length + 2 <= size) {
      current += (current ? "\n\n" : "") + p;
    } else {
      if (current) chunks.push(current);
      if (p.length <= size) {
        current = p;
      } else {
        for (let i = 0; i < p.length; i += size - overlap) {
          chunks.push(p.slice(i, i + size));
        }
        current = "";
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 0);
}

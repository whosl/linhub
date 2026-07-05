import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";

/**
 * 解析 embedding 模型：优先 settings.embeddingModelId 指定的模型，
 * 否则回退到 OpenAI/智谱供应商的默认 embedding 模型。
 * 统一走 OpenAI 兼容 embeddings 接口，维度固定 1536（与 pgvector 列一致）。
 */
async function resolveEmbeddingModel() {
  const [s] = await db
    .select({ modelId: schema.settings.embeddingModelId })
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"));

  let provider: typeof schema.providers.$inferSelect | undefined;
  let slug = "text-embedding-3-small";

  if (s?.modelId) {
    const [row] = await db
      .select({ model: schema.models, provider: schema.providers })
      .from(schema.models)
      .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
      .where(eq(schema.models.id, s.modelId));
    if (row) {
      provider = row.provider;
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
  return client.textEmbedding(slug);
}

export async function embedText(text: string): Promise<number[]> {
  const model = await resolveEmbeddingModel();
  const { embedding } = await embed({
    model,
    value: text.slice(0, 8000),
    providerOptions: { openai: { dimensions: 1536 } },
  });
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = await resolveEmbeddingModel();
  const { embeddings } = await embedMany({
    model,
    values: texts.map((t) => t.slice(0, 8000)),
    providerOptions: { openai: { dimensions: 1536 } },
  });
  return embeddings;
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
        // 超长段落硬切
        for (let i = 0; i < p.length; i += size - overlap) {
          chunks.push(p.slice(i, i + size));
        }
        current = "";
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 20);
}

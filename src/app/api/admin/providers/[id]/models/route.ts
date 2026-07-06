import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { decryptSecret } from "@/lib/server/crypto";
import type { RemoteModel } from "@/lib/types";

export const maxDuration = 60;

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  deepseek: "https://api.deepseek.com",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  xiaomi: "https://api.mimo.xiaomi.com/v1",
};

async function getProvider(id: string) {
  const [provider] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.id, id));
  if (!provider) throw new Error("供应商不存在");
  if (!provider.apiKeyEncrypted) throw new Error("请先配置该供应商的 API Key");
  return {
    provider,
    apiKey: decryptSecret(provider.apiKeyEncrypted),
    baseURL: provider.baseUrl || DEFAULT_BASE_URLS[provider.kind],
  };
}

/** 调供应商 API 拉取可用模型列表 */
async function fetchRemoteModels(
  kind: string,
  apiKey: string,
  baseURL: string
): Promise<{ slug: string; displayName?: string }[]> {
  if (kind === "anthropic") {
    const res = await fetch(`${baseURL}/v1/models?limit=100`, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new Error(`拉取失败（${res.status}）`);
    const data = (await res.json()) as {
      data: { id: string; display_name?: string }[];
    };
    return data.data.map((m) => ({ slug: m.id, displayName: m.display_name }));
  }

  if (kind === "google") {
    const res = await fetch(`${baseURL}/v1beta/models?pageSize=200&key=${apiKey}`);
    if (!res.ok) throw new Error(`拉取失败（${res.status}）`);
    const data = (await res.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({
        slug: m.name.replace(/^models\//, ""),
        displayName: m.displayName,
      }));
  }

  // OpenAI 兼容：openai / zhipu / deepseek / xiaomi
  const res = await fetch(`${baseURL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`拉取失败（${res.status}）`);
  const data = (await res.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((m) => ({ slug: m.id }));
}

/** GET：列出供应商远端模型，并标记哪些已添加 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  try {
    const { provider, apiKey, baseURL } = await getProvider(id);
    const remote = await fetchRemoteModels(provider.kind, apiKey, baseURL);
    const existing = await db
      .select({ slug: schema.models.slug })
      .from(schema.models)
      .where(eq(schema.models.providerId, id));
    const existingSlugs = new Set(existing.map((m) => m.slug));
    const list: RemoteModel[] = remote
      .map((m) => ({ ...m, added: existingSlugs.has(m.slug) }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    return Response.json(list);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "拉取模型失败" },
      { status: 502 }
    );
  }
}

/** 根据 slug 猜测能力与默认参数，管理员之后可在「模型与计价」中修改 */
function guessDefaults(slug: string) {
  const s = slug.toLowerCase();
  const isImage = /(image|dall-e|cogview|flux)/.test(s);
  const capabilities: string[] = [];
  if (isImage) {
    capabilities.push("image-generation");
  } else {
    capabilities.push("tools");
    if (/(gpt-4|gpt-5|gpt-4o|claude|gemini|glm-4v|glm-4\.|vl|vision|omni)/.test(s))
      capabilities.push("vision");
    if (/(o[1-9]|reason|thinking|r1|deepseek-r)/.test(s)) capabilities.push("reasoning");
  }
  return {
    capabilities,
    pricePerImage: isImage ? 30 : undefined,
    contextWindow: 128_000,
  };
}

/** POST：批量添加选中的模型 { slugs: string[] } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const { slugs } = (await req.json()) as { slugs: string[] };
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return Response.json({ error: "未选择模型" }, { status: 400 });
  }

  const [provider] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.id, id));
  if (!provider) return Response.json({ error: "供应商不存在" }, { status: 404 });

  const existing = await db
    .select({ slug: schema.models.slug })
    .from(schema.models)
    .where(eq(schema.models.providerId, id));
  const existingSlugs = new Set(existing.map((m) => m.slug));

  const toAdd = [...new Set(slugs)].filter((s) => s.trim() && !existingSlugs.has(s));
  if (toAdd.length > 0) {
    await db.insert(schema.models).values(
      toAdd.map((slug) => ({
        id: `m-${uid()}`,
        providerId: id,
        slug,
        displayName: slug,
        // 新模型默认停用，管理员设好价格后再启用
        enabled: false,
        ...guessDefaults(slug),
      }))
    );
  }
  return Response.json({ added: toAdd.length, skipped: slugs.length - toAdd.length });
}

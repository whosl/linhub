import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/server/crypto";
import { ensureSeeded } from "@/lib/server/seed";

/** 解密失败（密钥轮换/数据损坏）时按未配置处理，不让整个设置页 500（M10） */
function safeMask(encrypted: string | null): string | undefined {
  if (!encrypted) return undefined;
  try {
    return maskSecret(decryptSecret(encrypted));
  } catch {
    return "解密失败，请重新填写";
  }
}

function toUi(s: typeof schema.settings.$inferSelect) {
  return {
    siteName: s.siteName,
    defaultChatModelId: s.defaultChatModelId ?? undefined,
    visionHelperModelId: s.visionHelperModelId ?? undefined,
    embeddingModelId: s.embeddingModelId ?? undefined,
    tavilyApiKeyMasked: safeMask(s.tavilyApiKeyEncrypted),
    mimoApiKeyMasked: safeMask(s.mimoApiKeyEncrypted),
    mimoTtsVoice: s.mimoTtsVoice ?? undefined,
    skillMarketRequiresReview: s.skillMarketRequiresReview,
    registrationEnabled: s.registrationEnabled,
  };
}

export async function GET() {
  await ensureSeeded();
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"));
  return Response.json(toUi(row));
}

export async function POST(req: NextRequest) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as Record<string, unknown>;
  const patch: Partial<typeof schema.settings.$inferInsert> = {};
  if (typeof body.siteName === "string") patch.siteName = body.siteName;
  if (typeof body.defaultChatModelId === "string")
    patch.defaultChatModelId = body.defaultChatModelId || null;
  if (typeof body.visionHelperModelId === "string")
    patch.visionHelperModelId = body.visionHelperModelId;
  if (typeof body.embeddingModelId === "string")
    patch.embeddingModelId = body.embeddingModelId;
  if (typeof body.mimoTtsVoice === "string") patch.mimoTtsVoice = body.mimoTtsVoice;
  if (typeof body.skillMarketRequiresReview === "boolean")
    patch.skillMarketRequiresReview = body.skillMarketRequiresReview;
  if (typeof body.registrationEnabled === "boolean")
    patch.registrationEnabled = body.registrationEnabled;
  if (typeof body.tavilyApiKey === "string" && body.tavilyApiKey)
    patch.tavilyApiKeyEncrypted = encryptSecret(body.tavilyApiKey);
  if (typeof body.mimoApiKey === "string" && body.mimoApiKey)
    patch.mimoApiKeyEncrypted = encryptSecret(body.mimoApiKey);

  await db
    .update(schema.settings)
    .set(patch)
    .where(eq(schema.settings.id, "global"));
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"));
  return Response.json(toUi(row));
}

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/server/crypto";
import { ensureSeeded } from "@/lib/server/seed";

function toUi(s: typeof schema.settings.$inferSelect) {
  return {
    siteName: s.siteName,
    visionHelperModelId: s.visionHelperModelId ?? undefined,
    embeddingModelId: s.embeddingModelId ?? undefined,
    tavilyApiKeyMasked: s.tavilyApiKeyEncrypted
      ? maskSecret(decryptSecret(s.tavilyApiKeyEncrypted))
      : undefined,
    mimoApiKeyMasked: s.mimoApiKeyEncrypted
      ? maskSecret(decryptSecret(s.mimoApiKeyEncrypted))
      : undefined,
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

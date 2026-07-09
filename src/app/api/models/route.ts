import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";
import { getActiveSubscription } from "@/lib/server/billing";

export async function GET() {
  await ensureSeeded();
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      model: schema.models,
      providerKind: schema.providers.kind,
    })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .where(eq(schema.models.enabled, true))
    .orderBy(asc(schema.models.sortOrder), asc(schema.models.createdAt));

  // 解析默认模型：用户个人默认 → 全局默认 → 第一个可用模型
  const userId = session.user.id;
  const [user] = await db
    .select({ defaultModelId: schema.users.defaultModelId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const [globalSettings] = await db
    .select({ defaultChatModelId: schema.settings.defaultChatModelId })
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"))
    .limit(1);

  const hasProAccess =
    (await getActiveSubscription(userId))?.plan.modelTier === "pro";
  const accessibleRows = rows.filter(
    (r) => r.model.tier !== "pro" || hasProAccess
  );
  const defaultableChatModelRows = accessibleRows.filter(
    (r) => !(r.model.capabilities as string[]).includes("image-generation")
  );
  const defaultableChatModelIds = defaultableChatModelRows.map((r) => r.model.id);
  const defaultModelId =
    (user?.defaultModelId && defaultableChatModelIds.includes(user.defaultModelId)
      ? user.defaultModelId
      : undefined) ??
    (globalSettings?.defaultChatModelId &&
      defaultableChatModelIds.includes(globalSettings.defaultChatModelId)
      ? globalSettings.defaultChatModelId
      : undefined) ??
    defaultableChatModelIds[0];

  return Response.json({
    defaultModelId,
    models: accessibleRows.map(({ model: m, providerKind }) => ({
      id: m.id,
      providerId: m.providerId,
      providerKind,
      slug: m.slug,
      displayName: m.displayName,
      description: m.description ?? undefined,
      capabilities: m.capabilities,
      enabled: m.enabled,
      inputPricePerM: m.inputPricePerM,
      outputPricePerM: m.outputPricePerM,
      pricePerImage: m.pricePerImage ?? undefined,
      contextWindow: m.contextWindow,
      tier: m.tier,
    })),
  });
}

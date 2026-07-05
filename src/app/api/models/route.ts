import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";

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
    .orderBy(asc(schema.models.createdAt));

  return Response.json(
    rows.map(({ model: m, providerKind }) => ({
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
    }))
  );
}

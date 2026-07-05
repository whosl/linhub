import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";

function toUi(m: typeof schema.models.$inferSelect, providerKind: string) {
  return {
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
  };
}

export async function GET() {
  await ensureSeeded();
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db
    .select({ model: schema.models, kind: schema.providers.kind })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .orderBy(asc(schema.models.createdAt));
  return Response.json(rows.map((r) => toUi(r.model, r.kind)));
}

export async function POST(req: NextRequest) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as Partial<
    typeof schema.models.$inferInsert
  > & { id?: string };

  if (body.id) {
    const { id, ...patch } = body;
    await db.update(schema.models).set(patch).where(eq(schema.models.id, id));
    const [row] = await db
      .select({ model: schema.models, kind: schema.providers.kind })
      .from(schema.models)
      .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
      .where(eq(schema.models.id, id));
    return Response.json(toUi(row.model, row.kind));
  }

  const id = `m-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(schema.models).values({
    ...(body as typeof schema.models.$inferInsert),
    id,
  });
  const [row] = await db
    .select({ model: schema.models, kind: schema.providers.kind })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .where(eq(schema.models.id, id));
  return Response.json(toUi(row.model, row.kind));
}

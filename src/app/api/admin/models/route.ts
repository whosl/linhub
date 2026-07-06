import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";
import { parseBody } from "@/lib/server/validate";

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
    maxOutputTokens: m.maxOutputTokens ?? undefined,
    tier: m.tier,
    sortOrder: m.sortOrder,
  };
}

// I1: 严格白名单 schema，替代原先的 as 转型 + 任意列写入（曾可写 tier/sortOrder/id 等）
const ModelUpsertSchema = z.object({
  id: z.string().optional(),
  providerId: z.string().min(1),
  slug: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  inputPricePerM: z.number().int().nonnegative().default(0),
  outputPricePerM: z.number().int().nonnegative().default(0),
  pricePerImage: z.number().int().nonnegative().optional(),
  contextWindow: z.number().int().positive().default(128000),
  maxOutputTokens: z.number().int().positive().optional(),
  tier: z.enum(["free", "pro"]).default("free"),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  await ensureSeeded();
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db
    .select({ model: schema.models, kind: schema.providers.kind })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .orderBy(asc(schema.models.sortOrder), asc(schema.models.createdAt));
  return Response.json(rows.map((r) => toUi(r.model, r.kind)));
}

export async function POST(req: NextRequest) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await parseBody(req, ModelUpsertSchema);
  if (body instanceof Response) return body; // 400 校验失败

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
  await db.insert(schema.models).values({ ...body, id });
  const [row] = await db
    .select({ model: schema.models, kind: schema.providers.kind })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .where(eq(schema.models.id, id));
  return Response.json(toUi(row.model, row.kind));
}

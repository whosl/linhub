import { NextRequest } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
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

// I1: 严格白名单 schema，替代原先的 as 转型 + 任意列写入。
// 创建与更新分开校验：更新只写显式提交的字段，避免 toggle(enabled)
// 这类局部 PATCH 被必填字段拦住，或被默认值意外清空能力/价格。
const ModelCreateSchema = z.object({
  providerId: z.string().min(1),
  slug: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().nullable().optional(),
  capabilities: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  inputPricePerM: z.number().int().nonnegative().default(0),
  outputPricePerM: z.number().int().nonnegative().default(0),
  pricePerImage: z.number().int().nonnegative().nullable().optional(),
  contextWindow: z.number().int().positive().default(128000),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  tier: z.enum(["free", "pro"]).default("free"),
  sortOrder: z.number().int().default(0),
});
const ModelPatchSchema = ModelCreateSchema.partial().extend({
  id: z.string().min(1),
});
const ModelUpsertSchema = z.union([ModelPatchSchema, ModelCreateSchema]);
type ModelCreateInput = z.infer<typeof ModelCreateSchema>;
type ModelPatchInput = z.infer<typeof ModelPatchSchema>;
type ModelUpsertInput = z.infer<typeof ModelUpsertSchema>;

function isModelPatch(body: ModelUpsertInput): body is ModelPatchInput {
  return "id" in body;
}

export async function GET() {
  await ensureSeeded();
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db
    .select({ model: schema.models, kind: schema.providers.kind })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .orderBy(
      // 启用的模型自动排到前面（不再纯靠手动 sortOrder 数字）
      desc(schema.models.enabled),
      asc(schema.models.sortOrder),
      asc(schema.models.createdAt)
    );
  return Response.json(rows.map((r) => toUi(r.model, r.kind)));
}

export async function POST(req: NextRequest) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await parseBody(req, ModelUpsertSchema);
  if (body instanceof Response) return body; // 400 校验失败

  if (isModelPatch(body)) {
    const { id, ...patch } = body;
    await db.update(schema.models).set(patch).where(eq(schema.models.id, id));
    const [row] = await db
      .select({ model: schema.models, kind: schema.providers.kind })
      .from(schema.models)
      .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
      .where(eq(schema.models.id, id));
    if (!row) return Response.json({ error: "模型不存在" }, { status: 404 });
    return Response.json(toUi(row.model, row.kind));
  }

  const createBody: ModelCreateInput = body;
  const id = `m-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(schema.models).values({ ...createBody, id });
  const [row] = await db
    .select({ model: schema.models, kind: schema.providers.kind })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .where(eq(schema.models.id, id));
  return Response.json(toUi(row.model, row.kind));
}

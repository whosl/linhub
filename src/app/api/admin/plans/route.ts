import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";
import { parseBody } from "@/lib/server/validate";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

// I1: 校验套餐字段，价格/额度必须非负
const PlanUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "名称不能为空"),
  description: z.string().default(""),
  priceCentsPerMonth: z.number().int().nonnegative().default(0),
  monthlyQuotaCents: z.number().int().nonnegative().default(0),
  modelTier: z.enum(["free", "pro"]).default("free"),
  features: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

export async function GET() {
  await ensureSeeded();
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(schema.plans)
    .orderBy(asc(schema.plans.priceCentsPerMonth));
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const body = await parseBody(req, PlanUpsertSchema);
  if (body instanceof Response) return body; // 400 校验失败

  const values = {
    name: body.name,
    description: body.description,
    priceCentsPerMonth: body.priceCentsPerMonth,
    monthlyQuotaCents: body.monthlyQuotaCents,
    modelTier: body.modelTier,
    features: body.features,
    enabled: body.enabled,
  };
  const id = body.id ?? `plan-${uid()}`;
  if (body.id) {
    await db.update(schema.plans).set(values).where(eq(schema.plans.id, body.id));
  } else {
    await db.insert(schema.plans).values({ id, ...values });
  }
  const [row] = await db.select().from(schema.plans).where(eq(schema.plans.id, id));
  return Response.json(row);
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    await db.update(schema.plans).set({ enabled: false }).where(eq(schema.plans.id, id));
  }
  return Response.json({ ok: true });
}

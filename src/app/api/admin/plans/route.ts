import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";
import type { Plan } from "@/lib/types";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

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
  const body = (await req.json()) as Partial<Plan> & { name: string };
  if (!body.name?.trim()) return Response.json({ error: "名称不能为空" }, { status: 400 });

  const values = {
    name: body.name,
    description: body.description ?? "",
    priceCentsPerMonth: body.priceCentsPerMonth ?? 0,
    monthlyQuotaCents: body.monthlyQuotaCents ?? 0,
    modelTier: body.modelTier ?? ("free" as const),
    features: body.features ?? [],
    enabled: body.enabled ?? true,
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

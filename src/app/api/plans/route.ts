import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";

export async function GET() {
  await ensureSeeded();
  try {
    await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.enabled, true))
    .orderBy(asc(schema.plans.priceCentsPerMonth));
  return Response.json(rows);
}

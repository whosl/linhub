import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";
import { skillToUi } from "../../skills/util";

/** 待审核 Skill 列表 */
export async function GET() {
  await ensureSeeded();
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.visibility, "pending"))
    .orderBy(desc(schema.skills.updatedAt));
  return Response.json(rows.map(skillToUi));
}

/** 审核：{ id, approve } */
export async function POST(req: NextRequest) {
  await ensureSeeded();
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const { id, approve } = (await req.json()) as { id: string; approve: boolean };
  await db
    .update(schema.skills)
    .set({
      visibility: approve ? "public" : "private",
      reviewStatus: approve ? "approved" : "rejected",
      publishedAt: approve ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.skills.id, id));
  return Response.json({ ok: true });
}

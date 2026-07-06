import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  // 关联模型随 onDelete: cascade 一并删除
  await db.delete(schema.providers).where(eq(schema.providers.id, id));
  return Response.json({ ok: true });
}

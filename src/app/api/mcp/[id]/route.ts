import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const [existing] = await db
    .select()
    .from(schema.mcpServers)
    .where(eq(schema.mcpServers.id, id));
  if (!existing) return Response.json({ ok: true });
  const canDelete =
    (existing.scope === "user" && existing.ownerId === session.user.id) ||
    (existing.scope === "global" && session.user.role === "admin");
  if (!canDelete) return Response.json({ error: "无权限" }, { status: 403 });
  await db.delete(schema.mcpServers).where(eq(schema.mcpServers.id, id));
  return Response.json({ ok: true });
}

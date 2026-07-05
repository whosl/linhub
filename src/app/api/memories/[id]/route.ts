import { and, eq } from "drizzle-orm";
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
  await db
    .delete(schema.memories)
    .where(and(eq(schema.memories.id, id), eq(schema.memories.ownerId, session.user.id)));
  return Response.json({ ok: true });
}

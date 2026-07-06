import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await db
    .delete(schema.styles)
    .where(
      and(
        eq(schema.styles.id, id),
        eq(schema.styles.ownerId, session.user.id),
        eq(schema.styles.builtIn, false)
      )
    )
    .returning({ id: schema.styles.id });
  if (result.length === 0) {
    return Response.json({ error: "风格不存在" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

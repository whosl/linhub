import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

export async function GET(
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
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.projectId, id),
        eq(schema.conversations.ownerId, session.user.id),
        eq(schema.conversations.archived, false)
      )
    )
    .orderBy(desc(schema.conversations.updatedAt));
  return Response.json(
    rows.map((c) => ({
      id: c.id,
      title: c.title,
      projectId: c.projectId ?? undefined,
      skillId: c.skillId ?? undefined,
      modelId: c.modelId,
      styleId: c.styleId ?? undefined,
      pinned: c.pinned,
      archived: c.archived,
      currentLeafId: c.currentLeafId ?? undefined,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))
  );
}

import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { projectToUi } from "../util";

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
  const [row] = await db
    .select({
      project: schema.projects,
      conversationCount: sql<number>`(select count(*)::int from conversations c where c.project_id = projects.id)`,
    })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, id), eq(schema.projects.ownerId, session.user.id))
    );
  if (!row) return Response.json({ error: "不存在" }, { status: 404 });
  const files = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.projectId, id));
  return Response.json(projectToUi(row.project, row.conversationCount, files));
}

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
    .delete(schema.projects)
    .where(
      and(eq(schema.projects.id, id), eq(schema.projects.ownerId, session.user.id))
    );
  return Response.json({ ok: true });
}

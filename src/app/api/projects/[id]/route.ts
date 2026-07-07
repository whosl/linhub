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
      conversationCount: sql<number>`(select count(*)::int from conversations c where c.project_id = projects.id and c.archived = false)`,
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    description?: string | null;
    instructions?: string | null;
    color?: string | null;
    modelId?: string | null;
  };
  const [existing] = await db
    .select({ ownerId: schema.projects.ownerId })
    .from(schema.projects)
    .where(eq(schema.projects.id, id));
  if (!existing || existing.ownerId !== session.user.id) {
    return Response.json({ error: "不存在" }, { status: 404 });
  }

  const patch: {
    updatedAt: Date;
    name?: string;
    description?: string | null;
    instructions?: string | null;
    color?: string | null;
    modelId?: string | null;
  } = { updatedAt: new Date() };
  if ("name" in body) {
    if (!body.name?.trim()) {
      return Response.json({ error: "名称不能为空" }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if ("description" in body) patch.description = body.description?.trim() || null;
  if ("instructions" in body) patch.instructions = body.instructions ?? null;
  if ("color" in body) patch.color = body.color || null;
  if ("modelId" in body) patch.modelId = body.modelId || null;

  await db.update(schema.projects).set(patch).where(eq(schema.projects.id, id));
  const [row] = await db
    .select({
      project: schema.projects,
      conversationCount: sql<number>`(select count(*)::int from conversations c where c.project_id = projects.id and c.archived = false)`,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, id));
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

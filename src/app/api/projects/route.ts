import { NextRequest } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { projectToUi } from "./util";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const rows = await db
    .select({
      project: schema.projects,
      conversationCount: sql<number>`(select count(*)::int from conversations c where c.project_id = projects.id and c.archived = false)`,
    })
    .from(schema.projects)
    .where(eq(schema.projects.ownerId, session.user.id))
    .orderBy(desc(schema.projects.updatedAt));

  const result = [];
  for (const r of rows) {
    const files = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.projectId, r.project.id));
    result.push(projectToUi(r.project, r.conversationCount, files));
  }
  return Response.json(result);
}

/** 创建/更新项目 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await req.json()) as {
    id?: string;
    name: string;
    description?: string;
    instructions?: string;
    color?: string;
    modelId?: string;
  };
  if (!body.name?.trim()) return Response.json({ error: "名称不能为空" }, { status: 400 });

  const id = body.id ?? `proj-${uid()}`;
  if (body.id) {
    const [existing] = await db
      .select({ ownerId: schema.projects.ownerId })
      .from(schema.projects)
      .where(eq(schema.projects.id, body.id));
    if (!existing || existing.ownerId !== session.user.id) {
      return Response.json({ error: "不存在" }, { status: 404 });
    }
    await db
      .update(schema.projects)
      .set({
        name: body.name,
        description: body.description,
        instructions: body.instructions,
        color: body.color,
        modelId: body.modelId || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, body.id));
  } else {
    await db.insert(schema.projects).values({
      id,
      ownerId: session.user.id,
      name: body.name,
      description: body.description,
      instructions: body.instructions,
      color: body.color,
      modelId: body.modelId || null,
    });
  }
  const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  const files = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.projectId, id));
  return Response.json(projectToUi(row, 0, files));
}

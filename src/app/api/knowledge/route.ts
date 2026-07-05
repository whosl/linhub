import { NextRequest } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

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
      kb: schema.knowledgeBases,
      documentCount: sql<number>`(select count(*)::int from kb_documents d where d.knowledge_base_id = knowledge_bases.id)`,
      totalChunks: sql<number>`(select coalesce(sum(d.chunk_count),0)::int from kb_documents d where d.knowledge_base_id = knowledge_bases.id)`,
    })
    .from(schema.knowledgeBases)
    .where(eq(schema.knowledgeBases.ownerId, session.user.id))
    .orderBy(desc(schema.knowledgeBases.updatedAt));
  return Response.json(
    rows.map((r) => ({
      id: r.kb.id,
      name: r.kb.name,
      description: r.kb.description ?? undefined,
      documentCount: r.documentCount,
      totalChunks: r.totalChunks,
      createdAt: r.kb.createdAt.toISOString(),
      updatedAt: r.kb.updatedAt.toISOString(),
    }))
  );
}

/** 创建/更新知识库 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await req.json()) as { id?: string; name: string; description?: string };
  if (!body.name?.trim()) return Response.json({ error: "名称不能为空" }, { status: 400 });

  const id = body.id ?? `kb-${uid()}`;
  if (body.id) {
    const [existing] = await db
      .select({ ownerId: schema.knowledgeBases.ownerId })
      .from(schema.knowledgeBases)
      .where(eq(schema.knowledgeBases.id, body.id));
    if (!existing || existing.ownerId !== session.user.id) {
      return Response.json({ error: "不存在" }, { status: 404 });
    }
    await db
      .update(schema.knowledgeBases)
      .set({ name: body.name, description: body.description, updatedAt: new Date() })
      .where(eq(schema.knowledgeBases.id, body.id));
  } else {
    await db.insert(schema.knowledgeBases).values({
      id,
      ownerId: session.user.id,
      name: body.name,
      description: body.description,
    });
  }
  const [row] = await db
    .select()
    .from(schema.knowledgeBases)
    .where(eq(schema.knowledgeBases.id, id));
  return Response.json({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    documentCount: 0,
    totalChunks: 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

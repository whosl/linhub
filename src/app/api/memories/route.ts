import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
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
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.ownerId, session.user.id))
    .orderBy(desc(schema.memories.updatedAt));
  return Response.json(
    rows.map((m) => ({
      id: m.id,
      content: m.content,
      sourceConversationId: m.sourceConversationId ?? undefined,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }))
  );
}

/** 创建或更新记忆 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await req.json()) as { id?: string; content: string };
  if (!body.content?.trim()) {
    return Response.json({ error: "内容不能为空" }, { status: 400 });
  }

  let embedding: number[] | null = null;
  try {
    const { embedText } = await import("@/lib/server/llm/embedding");
    embedding = await embedText(body.content, { userId: session.user.id });
  } catch {
    // 未配置 embedding 时保存纯文本
  }

  if (body.id) {
    const [existing] = await db
      .select({ ownerId: schema.memories.ownerId })
      .from(schema.memories)
      .where(eq(schema.memories.id, body.id));
    if (!existing || existing.ownerId !== session.user.id) {
      return Response.json({ error: "不存在" }, { status: 404 });
    }
    await db
      .update(schema.memories)
      .set({ content: body.content, embedding, updatedAt: new Date() })
      .where(eq(schema.memories.id, body.id));
    const [row] = await db.select().from(schema.memories).where(eq(schema.memories.id, body.id));
    return Response.json({
      id: row.id,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  const id = `mem-${uid()}`;
  await db.insert(schema.memories).values({
    id,
    ownerId: session.user.id,
    content: body.content,
    embedding,
  });
  const [row] = await db.select().from(schema.memories).where(eq(schema.memories.id, id));
  return Response.json({
    id: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

async function ownedConversation(id: string, userId: string) {
  const [c] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(eq(schema.conversations.id, id), eq(schema.conversations.ownerId, userId))
    );
  return c ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const c = await ownedConversation(id, session.user.id);
  if (!c) return Response.json({ error: "not found" }, { status: 404 });

  const msgs = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, id))
    .orderBy(asc(schema.messages.createdAt));

  return Response.json({
    conversation: {
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
    },
    messages: msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      parentId: m.parentId,
      role: m.role,
      parts: m.parts,
      modelId: m.modelId ?? undefined,
      quotedText: m.quotedText ?? undefined,
      feedback: m.feedback ?? undefined,
      usage: m.usage ?? undefined,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const c = await ownedConversation(id, session.user.id);
  if (!c) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json()) as Partial<{
    title: string;
    pinned: boolean;
    archived: boolean;
    projectId: string | null;
    currentLeafId: string;
    modelId: string;
  }>;

  // 白名单化补丁字段，避免客户端注入任意列
  const patch: Partial<typeof schema.conversations.$inferInsert> = {};
  if (typeof body.title === "string") patch.title = body.title.slice(0, 100);
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  if (typeof body.archived === "boolean") patch.archived = body.archived;
  if (
    typeof body.currentLeafId === "string" &&
    body.currentLeafId !== c.currentLeafId
  ) {
    const [message] = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.id, body.currentLeafId),
          eq(schema.messages.conversationId, id)
        )
      )
      .limit(1);
    if (!message) return Response.json({ error: "分支不存在" }, { status: 400 });
    patch.currentLeafId = body.currentLeafId;
  }
  if (typeof body.modelId === "string") patch.modelId = body.modelId;
  if (body.projectId !== undefined) {
    if (body.projectId === null) {
      patch.projectId = null;
    } else {
      // 移入项目前校验项目归属（防 IDOR）
      const [p] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, body.projectId),
            eq(schema.projects.ownerId, session.user.id)
          )
        );
      if (!p) return Response.json({ error: "项目不存在" }, { status: 404 });
      patch.projectId = body.projectId;
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true });
  }

  await db
    .update(schema.conversations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.conversations.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const c = await ownedConversation(id, session.user.id);
  if (!c) return Response.json({ error: "not found" }, { status: 404 });
  await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
  return Response.json({ ok: true });
}

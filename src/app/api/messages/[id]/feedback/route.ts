import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { feedback } = (await req.json()) as {
    feedback: "up" | "down" | null;
  };
  // 校验消息属于当前用户的会话（防越权写他人消息）
  const [msg] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .innerJoin(
      schema.conversations,
      eq(schema.messages.conversationId, schema.conversations.id)
    )
    .where(
      and(eq(schema.messages.id, id), eq(schema.conversations.ownerId, session.user.id))
    );
  if (!msg) return Response.json({ error: "not found" }, { status: 404 });
  await db
    .update(schema.messages)
    .set({ feedback })
    .where(eq(schema.messages.id, id));
  return Response.json({ ok: true });
}

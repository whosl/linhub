import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { toUiArtifact } from "./util";

/** 列出某会话的 artifacts（校验会话归属） */
export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) return Response.json([], { status: 200 });

  const [conversation] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.ownerId, session.user.id)
      )
    );
  if (!conversation) return Response.json([], { status: 200 });

  const rows = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.conversationId, conversationId))
    .orderBy(asc(schema.artifacts.createdAt));
  return Response.json(rows.map(toUiArtifact));
}

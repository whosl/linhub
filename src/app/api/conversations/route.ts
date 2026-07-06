import { NextRequest } from "next/server";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";

/**
 * I4: 转义 ILIKE 的元字符（\ % _），防止用户输入的通配符被当作模式，
 * 既避免 %_%_%... 拖慢 Postgres，也保证标题含这些字符时精确匹配。
 * 用 ESCAPE '\' 显式声明转义字符。
 */
function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(
      q
        ? and(
            eq(schema.conversations.ownerId, session.user.id),
            // I4: 转义通配符后用 ESCAPE '\' 包裹
            ilike(schema.conversations.title, `%${escapeIlike(q)}%`)
          )
        : eq(schema.conversations.ownerId, session.user.id)
    )
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(200);

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

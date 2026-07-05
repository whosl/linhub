import { NextRequest } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q");
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(
      q
        ? and(
            eq(schema.conversations.ownerId, session.user.id),
            or(ilike(schema.conversations.title, `%${q}%`))
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

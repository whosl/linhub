import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { skillToUi } from "../util";

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
  // 自己的或公开的
  const [row] = await db
    .select()
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.id, id),
        or(eq(schema.skills.ownerId, session.user.id), eq(schema.skills.visibility, "public"))
      )
    );
  if (!row) return Response.json({ error: "不存在" }, { status: 404 });
  return Response.json(skillToUi(row));
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
    .delete(schema.skills)
    .where(and(eq(schema.skills.id, id), eq(schema.skills.ownerId, session.user.id)));
  return Response.json({ ok: true });
}

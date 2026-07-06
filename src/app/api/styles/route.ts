import { NextRequest } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";

export async function GET() {
  await ensureSeeded();
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.styles)
    .where(
      or(isNull(schema.styles.ownerId), eq(schema.styles.ownerId, session.user.id))
    );
  return Response.json(
    rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      prompt: s.prompt ?? undefined,
      builtIn: s.builtIn,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    id?: string;
    name: string;
    description?: string;
    prompt?: string;
  };

  if (body.id) {
    // 更新：只能改自己的非内置风格（防覆盖内置/他人风格）
    const [existing] = await db
      .select({ id: schema.styles.id })
      .from(schema.styles)
      .where(
        and(
          eq(schema.styles.id, body.id),
          eq(schema.styles.ownerId, session.user.id),
          eq(schema.styles.builtIn, false)
        )
      );
    if (!existing) return Response.json({ error: "风格不存在" }, { status: 404 });
    await db
      .update(schema.styles)
      .set({
        name: body.name,
        description: body.description ?? "",
        prompt: body.prompt,
      })
      .where(eq(schema.styles.id, body.id));
    const [row] = await db.select().from(schema.styles).where(eq(schema.styles.id, body.id));
    return Response.json(row);
  }

  const id = `style-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(schema.styles).values({
    id,
    ownerId: session.user.id,
    name: body.name,
    description: body.description ?? "",
    prompt: body.prompt,
    builtIn: false,
  });
  const [row] = await db.select().from(schema.styles).where(eq(schema.styles.id, id));
  return Response.json(row);
}

import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { skillToUi } from "./util";
import type { Skill } from "@/lib/types";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const market = req.nextUrl.searchParams.get("market") === "1";
  if (market) {
    const rows = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.visibility, "public"))
      .orderBy(desc(schema.skills.usageCount));
    return Response.json(rows.map(skillToUi));
  }
  const rows = await db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.ownerId, session.user.id))
    .orderBy(desc(schema.skills.updatedAt));
  return Response.json(rows.map(skillToUi));
}

/** 创建/更新 Skill；visibility=pending 表示提交广场审核 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await req.json()) as Partial<Skill> & { name: string };
  if (!body.name?.trim()) return Response.json({ error: "名称不能为空" }, { status: 400 });

  const values = {
    name: body.name,
    emoji: body.emoji ?? "🤖",
    description: body.description ?? "",
    systemPrompt: body.systemPrompt ?? "",
    greeting: body.greeting,
    defaultModelId: body.defaultModelId,
    enabledTools: (body.enabledTools ?? []) as string[],
    knowledgeBaseIds: body.knowledgeBaseIds ?? [],
    visibility: body.visibility ?? ("private" as const),
  };

  if (body.id) {
    const [existing] = await db
      .select({ ownerId: schema.skills.ownerId })
      .from(schema.skills)
      .where(eq(schema.skills.id, body.id));
    if (!existing || existing.ownerId !== session.user.id) {
      return Response.json({ error: "不存在" }, { status: 404 });
    }
    await db
      .update(schema.skills)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.skills.id, body.id));
    const [row] = await db.select().from(schema.skills).where(eq(schema.skills.id, body.id));
    return Response.json(skillToUi(row));
  }

  const id = `skill-${uid()}`;
  await db.insert(schema.skills).values({ id, ownerId: session.user.id, ...values });
  const [row] = await db.select().from(schema.skills).where(eq(schema.skills.id, id));
  return Response.json(skillToUi(row));
}

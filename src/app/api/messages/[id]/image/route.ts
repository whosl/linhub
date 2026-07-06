import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { isValidationResponse, parseBody } from "@/lib/server/validate";

const LocalImagePathSchema = z
  .string()
  .max(2048)
  .regex(/^\/(?:generated|uploads)\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i, "图片路径无效");

const ReplaceImageSchema = z.object({
  oldUrl: z.string().max(2048),
  newUrl: LocalImagePathSchema,
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await parseBody(req, ReplaceImageSchema);
  if (isValidationResponse(body)) return body;

  const [row] = await db
    .select({
      message: schema.messages,
      conversationId: schema.conversations.id,
    })
    .from(schema.messages)
    .innerJoin(
      schema.conversations,
      eq(schema.messages.conversationId, schema.conversations.id)
    )
    .where(
      and(eq(schema.messages.id, id), eq(schema.conversations.ownerId, session.user.id))
    )
    .limit(1);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  let replaced = false;
  const parts = (row.message.parts as Array<Record<string, unknown>>).map((part) => {
    if (part.type === "image" && part.url === body.oldUrl) {
      replaced = true;
      return { ...part, url: body.newUrl, alt: "编辑后的图片" };
    }
    return part;
  });
  if (!replaced) return Response.json({ error: "图片不存在" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.update(schema.messages).set({ parts }).where(eq(schema.messages.id, id));
    await tx
      .update(schema.conversations)
      .set({ updatedAt: new Date() })
      .where(eq(schema.conversations.id, row.conversationId));
  });

  return Response.json({ ok: true });
}

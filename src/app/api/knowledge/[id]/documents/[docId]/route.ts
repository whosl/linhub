import { unlink } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, docId } = await params;
  const [kb] = await db
    .select({ id: schema.knowledgeBases.id })
    .from(schema.knowledgeBases)
    .where(
      and(
        eq(schema.knowledgeBases.id, id),
        eq(schema.knowledgeBases.ownerId, session.user.id)
      )
    );
  if (!kb) return Response.json({ error: "不存在" }, { status: 404 });

  const [doc] = await db
    .select({
      id: schema.kbDocuments.id,
      storagePath: schema.kbDocuments.storagePath,
    })
    .from(schema.kbDocuments)
    .where(
      and(
        eq(schema.kbDocuments.id, docId),
        eq(schema.kbDocuments.knowledgeBaseId, id)
      )
    )
    .limit(1);
  if (!doc) return Response.json({ error: "不存在" }, { status: 404 });

  await db
    .delete(schema.kbDocuments)
    .where(
      and(
        eq(schema.kbDocuments.id, docId),
        eq(schema.kbDocuments.knowledgeBaseId, id)
      )
    );

  if (doc.storagePath && !doc.storagePath.includes("..")) {
    await unlink(path.join(process.cwd(), doc.storagePath)).catch(() => undefined);
  }
  return Response.json({ ok: true });
}

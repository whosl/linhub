import { unlink } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

const KNOWLEDGE_DOCUMENTS_ROOT = path.resolve(process.cwd(), "data", "kb-docs");

function localKnowledgeDocumentPath(storagePath: string | null) {
  if (!storagePath) return null;
  const absolute = path.resolve(process.cwd(), storagePath);
  const relative = path.relative(KNOWLEDGE_DOCUMENTS_ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return absolute;
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
  const [knowledgeBase] = await db
    .select({ id: schema.knowledgeBases.id })
    .from(schema.knowledgeBases)
    .where(
      and(
        eq(schema.knowledgeBases.id, id),
        eq(schema.knowledgeBases.ownerId, session.user.id)
      )
    )
    .limit(1);
  if (!knowledgeBase) {
    return Response.json({ error: "知识库不存在" }, { status: 404 });
  }

  const documents = await db
    .select({ storagePath: schema.kbDocuments.storagePath })
    .from(schema.kbDocuments)
    .where(eq(schema.kbDocuments.knowledgeBaseId, id));

  await db
    .delete(schema.knowledgeBases)
    .where(
      and(
        eq(schema.knowledgeBases.id, id),
        eq(schema.knowledgeBases.ownerId, session.user.id)
      )
    );

  await Promise.all(
    documents.map(async ({ storagePath }) => {
      const filePath = localKnowledgeDocumentPath(storagePath);
      if (filePath) await unlink(filePath).catch(() => undefined);
    })
  );
  return Response.json({ ok: true });
}

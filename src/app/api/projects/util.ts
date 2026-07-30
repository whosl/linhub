import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import type { Project, ProjectKnowledgeBase } from "@/lib/types";

type ProjectRow = typeof schema.projects.$inferSelect;
type AttachmentRow = typeof schema.attachments.$inferSelect;
const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

export function normalizeKnowledgeBaseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    )
  );
}

export async function assertOwnedKnowledgeBaseIds(
  userId: string,
  value: unknown
): Promise<string[]> {
  const ids = normalizeKnowledgeBaseIds(value);
  if (ids.length === 0) return ids;
  const ownedRows = await db
    .select({ id: schema.knowledgeBases.id })
    .from(schema.knowledgeBases)
    .where(
      and(
        eq(schema.knowledgeBases.ownerId, userId),
        inArray(schema.knowledgeBases.id, ids)
      )
    );
  if (ownedRows.length !== ids.length) throw new Error("知识库不存在");
  return ids;
}

export async function replaceProjectKnowledgeBases(
  projectId: string,
  userId: string,
  knowledgeBaseIds: string[]
) {
  const ids = await assertOwnedKnowledgeBaseIds(userId, knowledgeBaseIds);

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.projectKnowledgeBases)
      .where(eq(schema.projectKnowledgeBases.projectId, projectId));
    if (ids.length === 0) return;
    await tx.insert(schema.projectKnowledgeBases).values(
      ids.map((knowledgeBaseId) => ({
        id: `pkb-${uid()}`,
        projectId,
        knowledgeBaseId,
      }))
    );
  });
}

export async function listProjectKnowledgeBases(
  projectId: string,
  userId: string
): Promise<ProjectKnowledgeBase[]> {
  const rows = await db
    .select({
      id: schema.knowledgeBases.id,
      name: schema.knowledgeBases.name,
      description: schema.knowledgeBases.description,
      documentCount: sql<number>`(select count(*)::int from kb_documents d where d.knowledge_base_id = ${schema.knowledgeBases.id})`,
      totalChunks: sql<number>`(select coalesce(sum(d.chunk_count),0)::int from kb_documents d where d.knowledge_base_id = ${schema.knowledgeBases.id})`,
    })
    .from(schema.projectKnowledgeBases)
    .innerJoin(
      schema.knowledgeBases,
      eq(schema.projectKnowledgeBases.knowledgeBaseId, schema.knowledgeBases.id)
    )
    .where(
      and(
        eq(schema.projectKnowledgeBases.projectId, projectId),
        eq(schema.knowledgeBases.ownerId, userId)
      )
    );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    documentCount: row.documentCount,
    totalChunks: row.totalChunks,
  }));
}

export function projectToUi(
  p: ProjectRow,
  conversationCount: number,
  files: AttachmentRow[],
  knowledgeBases: ProjectKnowledgeBase[] = []
): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? undefined,
    instructions: p.instructions ?? undefined,
    color: p.color ?? undefined,
    modelId: p.modelId ?? undefined,
    knowledgeBaseIds: knowledgeBases.map((kb) => kb.id),
    knowledgeBases,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    conversationCount,
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

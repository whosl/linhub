import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import type { Artifact } from "@/lib/types";

export function toUiArtifact(a: typeof schema.artifacts.$inferSelect): Artifact {
  return {
    id: a.id,
    conversationId: a.conversationId,
    title: a.title,
    kind: a.kind,
    language: a.language ?? undefined,
    versions: a.versions,
    currentVersion: a.currentVersion,
    shareToken: a.shareToken ?? undefined,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** 取回 artifact 并校验属主 */
export async function getOwnedArtifact(artifactId: string, userId: string) {
  const [row] = await db
    .select({ artifact: schema.artifacts })
    .from(schema.artifacts)
    .innerJoin(
      schema.conversations,
      eq(schema.artifacts.conversationId, schema.conversations.id)
    )
    .where(
      and(eq(schema.artifacts.id, artifactId), eq(schema.conversations.ownerId, userId))
    );
  return row?.artifact ?? null;
}

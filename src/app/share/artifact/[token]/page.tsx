import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/server/db";
import { SharedArtifactView } from "./view";

export default async function SharedArtifactPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.shareToken, token));
  if (!artifact) notFound();

  return (
    <SharedArtifactView
      artifact={{
        id: artifact.id,
        conversationId: artifact.conversationId,
        title: artifact.title,
        kind: artifact.kind,
        language: artifact.language ?? undefined,
        versions: artifact.versions,
        currentVersion: artifact.currentVersion,
        createdAt: artifact.createdAt.toISOString(),
        updatedAt: artifact.updatedAt.toISOString(),
      }}
    />
  );
}

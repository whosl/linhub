import type { schema } from "@/lib/server/db";
import type { Project } from "@/lib/types";

type ProjectRow = typeof schema.projects.$inferSelect;
type AttachmentRow = typeof schema.attachments.$inferSelect;

export function projectToUi(
  p: ProjectRow,
  conversationCount: number,
  files: AttachmentRow[]
): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? undefined,
    instructions: p.instructions ?? undefined,
    color: p.color ?? undefined,
    modelId: p.modelId ?? undefined,
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

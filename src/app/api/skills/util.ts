import type { schema } from "@/lib/server/db";
import type { Skill, ToolName } from "@/lib/types";

export function skillToUi(s: typeof schema.skills.$inferSelect): Skill {
  return {
    id: s.id,
    ownerId: s.ownerId,
    name: s.name,
    emoji: s.emoji,
    description: s.description,
    systemPrompt: s.systemPrompt,
    greeting: s.greeting ?? undefined,
    defaultModelId: s.defaultModelId ?? undefined,
    enabledTools: s.enabledTools as ToolName[],
    knowledgeBaseIds: s.knowledgeBaseIds,
    visibility: s.visibility,
    usageCount: s.usageCount,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

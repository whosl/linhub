import type { schema } from "@/lib/server/db";
import type {
  Skill,
  SkillResourceRef,
  SkillScriptPolicy,
  ToolName,
} from "@/lib/types";

export function skillToUi(s: typeof schema.skills.$inferSelect): Skill {
  return {
    id: s.id,
    ownerId: s.ownerId,
    name: s.name,
    emoji: s.emoji,
    description: s.description,
    systemPrompt: s.systemPrompt,
    kind: s.kind ?? "prompt",
    version: s.version ?? "1.0.0",
    source: s.source ?? "user",
    manifest: (s.manifest ?? {}) as Record<string, unknown>,
    packagePath: s.packagePath ?? undefined,
    requiredTools: (s.requiredTools ?? []) as ToolName[],
    resourceRefs: (s.resourceRefs ?? []) as SkillResourceRef[],
    scriptPolicy: (s.scriptPolicy ?? { enabled: false }) as SkillScriptPolicy,
    reviewStatus: s.reviewStatus ?? "approved",
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

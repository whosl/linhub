import "server-only";

import { stat } from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/lib/server/db";
import type { SkillResourceRef, SkillScriptPolicy } from "@/lib/types";
import {
  loadAgentSkillPackage,
  type AgentSkillPackage,
} from "@/lib/server/skills/agent-skill-spec";

export interface InstallAgentSkillOptions {
  ownerId: string;
  packageRoot: string;
  source?: string;
  visibility?: "private" | "pending" | "public";
  reviewStatus?: "draft" | "pending" | "approved" | "rejected";
  builtIn?: boolean;
}

/**
 * 将标准 Agent Skill 包索引到 LinHub。磁盘包是事实源，数据库只保存检索和权限快照。
 */
export async function installAgentSkillPackage(options: InstallAgentSkillOptions) {
  const skill = await loadAgentSkillPackage(options.packageRoot);
  const linhub = normalizeLinhubManifest(skill);
  const id = linhub.id || `skill-${skill.frontmatter.name}`;
  const visibility = options.visibility ?? (options.builtIn ? "public" : "private");
  const reviewStatus =
    options.reviewStatus ?? (options.builtIn ? "approved" : "pending");
  const scriptPolicy = normalizeScriptPolicy(linhub, reviewStatus);
  const resourceRefs = toResourceRefs(skill);
  const requiredTools = Array.from(
    new Set([
      ...skill.frontmatter.allowedTools,
      ...linhub.requiredTools,
      ...(resourceRefs.length > 0 ? ["list_skill_resources", "read_skill_resource"] : []),
    ])
  );
  const values = {
    ownerId: options.ownerId,
    name: linhub.displayName || skill.frontmatter.name,
    slug: skill.frontmatter.name,
    emoji: linhub.emoji || "🧩",
    description: skill.frontmatter.description,
    systemPrompt: skill.instructions,
    kind: "pack" as const,
    version: skill.frontmatter.metadata.version || "1.0.0",
    source: options.source || skill.frontmatter.metadata.author || "Agent Skills",
    license: skill.frontmatter.license,
    compatibility: skill.frontmatter.compatibility,
    allowedTools: skill.frontmatter.allowedTools,
    packageDigest: skill.digest,
    manifest: {
      specification: "https://agentskills.io/specification",
      metadata: skill.frontmatter.metadata,
      linhub,
      files: skill.files.map((file) => ({
        path: file.path,
        kind: file.kind,
        size: file.size,
      })),
    },
    packagePath: path.resolve(options.packageRoot),
    requiredTools,
    resourceRefs,
    scriptPolicy,
    reviewStatus,
    visibility,
    publishedAt: visibility === "public" ? new Date() : null,
  };

  await db
    .insert(schema.skills)
    .values({ id, ...values })
    .onConflictDoUpdate({
      target: schema.skills.id,
      set: { ...values, updatedAt: new Date() },
    });
  return { id, skill };
}

export async function installBuiltInAgentSkills(root: string, ownerId: string) {
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) return [];
  const { scanAgentSkillPackages } = await import("@/lib/server/skills/agent-skill-spec");
  const packages = await scanAgentSkillPackages(root);
  const installed: string[] = [];
  for (const item of packages) {
    const result = await installAgentSkillPackage({
      ownerId,
      packageRoot: item.root,
      source: item.frontmatter.metadata.author || "LinHub native",
      visibility: "public",
      reviewStatus: "approved",
      builtIn: true,
    });
    installed.push(result.id);
  }
  return installed;
}

type LinhubManifest = {
  id: string;
  displayName: string;
  emoji: string;
  requiredTools: string[];
  allowedScripts: string[];
  scriptTimeoutMs?: number;
  scriptNetwork: boolean;
  raw: Record<string, unknown>;
};

function normalizeLinhubManifest(skill: AgentSkillPackage): LinhubManifest {
  const raw = skill.linhubManifest ?? {};
  const display = objectValue(raw.display);
  const capabilities = objectValue(raw.capabilities);
  const sandbox = objectValue(raw.sandbox);
  return {
    id: stringValue(raw.id),
    displayName: stringValue(display.name) || stringValue(display.displayName),
    emoji: stringValue(display.emoji),
    requiredTools: stringArray(capabilities.requiredTools ?? capabilities.required),
    allowedScripts: stringArray(sandbox.allowedScripts),
    scriptTimeoutMs:
      typeof sandbox.timeoutMs === "number" ? sandbox.timeoutMs : undefined,
    scriptNetwork: sandbox.network === true,
    raw,
  };
}

function normalizeScriptPolicy(
  manifest: LinhubManifest,
  reviewStatus: InstallAgentSkillOptions["reviewStatus"]
): SkillScriptPolicy {
  const enabled = reviewStatus === "approved" && manifest.allowedScripts.length > 0;
  return {
    enabled,
    allowedScripts: enabled ? manifest.allowedScripts : [],
    timeoutMs: manifest.scriptTimeoutMs,
    network: enabled && manifest.scriptNetwork,
  };
}

function toResourceRefs(skill: AgentSkillPackage): SkillResourceRef[] {
  return skill.files
    .filter((file) => file.kind === "reference" || file.kind === "asset")
    .map((file) => ({
      id: file.path.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, ""),
      name: path.basename(file.path),
      kind: file.kind === "reference" ? "reference" : "asset",
      path: file.path,
      mimeType: file.mimeType,
      size: file.size,
    }));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

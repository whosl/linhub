import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { installBuiltInAgentSkills } from "@/lib/server/skills/agent-skill-registry";
import type {
  ChatToolToggles,
  SkillResourceRef,
  SkillScriptPolicy,
  ToolName,
} from "@/lib/types";

type SkillRow = typeof schema.skills.$inferSelect;

const PPTX_SKILL_ID = "skill-pptx-native";
const DASHI_PPT_SKILL_ID = "skill-dashi-ppt";
const SCRIPT_OUTPUT_LIMIT = 8_000;
const DEFAULT_SCRIPT_TIMEOUT_MS = 30_000;

let schemaReady = false;
let nativeSkillsReady = false;

export async function ensureSkillRuntimeReady() {
  if (!schemaReady) {
    await ensureSkillRuntimeColumns();
    schemaReady = true;
  }
  if (!nativeSkillsReady) {
    nativeSkillsReady = await seedNativeSkillPacks();
  }
}

async function ensureSkillRuntimeColumns() {
  await db.execute(sql`
    alter table if exists skills
      add column if not exists kind text not null default 'prompt',
      add column if not exists slug text,
      add column if not exists version text not null default '1.0.0',
      add column if not exists source text not null default 'user',
      add column if not exists license text,
      add column if not exists compatibility text,
      add column if not exists allowed_tools jsonb not null default '[]'::jsonb,
      add column if not exists package_digest text,
      add column if not exists manifest jsonb not null default '{}'::jsonb,
      add column if not exists package_path text,
      add column if not exists required_tools jsonb not null default '[]'::jsonb,
      add column if not exists resource_refs jsonb not null default '[]'::jsonb,
      add column if not exists script_policy jsonb not null default '{"enabled":false}'::jsonb,
      add column if not exists review_status text not null default 'approved',
      add column if not exists published_at timestamp
  `);
}

async function seedNativeSkillPacks() {
  const [owner] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .orderBy(sql`case when ${schema.users.role} = 'admin' then 0 else 1 end`, schema.users.createdAt)
    .limit(1);
  if (!owner) return false;

  const instructions = [
    "你是 LinHub 原生 PPT 演示文稿助手，专门帮助用户读取、总结、规划和生成 .pptx 演示文稿。",
    "当用户上传 .pptx 并要求总结、提纲、逐页提取、改写或基于模板生成新版时，优先调用 pptx_extract_text 或 pptx_analyze_template 获取结构，不要凭文件名猜测。",
    "当用户要求创建演示文稿时，先把内容组织成清晰的 slide 数组，再调用 pptx_create_deck 生成可下载文件。每页标题应短，正文用 3-6 条要点，必要时把讲稿放入 notes。",
    "v1 能力聚焦轻量模板分析和重新生成新 deck；如果用户要求像素级保留原模板动画、母版或复杂版式，要明确说明当前版本不承诺 XML 级精修。",
    "生成 PPT 后，用简短中文说明文件已生成、页数和下载入口，不要把整份 PPT 内容重复粘贴在聊天正文里。",
  ].join("\n");

  const resourceRefs: SkillResourceRef[] = [
    {
      id: "pptx-native-v1-guide",
      name: "PPTX 原生能力说明",
      kind: "instruction",
      description: "LinHub 自研 PPTX Skill Pack v1 的能力边界和建议流程。",
      mimeType: "text/markdown",
      content:
        "支持读取 .pptx 文本、备注和基础结构；支持用 pptxgenjs 从大纲生成新演示文稿；支持对模板做轻量结构分析后重新生成新版。当前版本不复制第三方专有技能内容，也不执行外部脚本。",
    },
  ];

  await db
    .insert(schema.skills)
    .values({
      id: PPTX_SKILL_ID,
      ownerId: owner.id,
      name: "PPT 演示文稿助手",
      emoji: "📊",
      description: "读取、总结、分析模板并生成可下载的 PowerPoint 演示文稿。",
      systemPrompt: instructions,
      kind: "pack",
      version: "1.0.0",
      source: "LinHub native",
      manifest: {
        id: "linhub-native-pptx",
        title: "PPT 演示文稿助手",
        license: "LinHub native",
        tags: ["pptx", "presentation", "skill-pack"],
      },
      packagePath: "builtin://pptx",
      requiredTools: [
        "list_skill_resources",
        "read_skill_resource",
        "pptx_extract_text",
        "pptx_analyze_template",
        "pptx_create_deck",
      ],
      resourceRefs,
      scriptPolicy: { enabled: false },
      reviewStatus: "approved",
      visibility: "public",
      publishedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.skills.id,
      set: {
        name: "PPT 演示文稿助手",
        emoji: "📊",
        description: "读取、总结、分析模板并生成可下载的 PowerPoint 演示文稿。",
        systemPrompt: instructions,
        kind: "pack",
        version: "1.0.0",
        source: "LinHub native",
        manifest: {
          id: "linhub-native-pptx",
          title: "PPT 演示文稿助手",
          license: "LinHub native",
          tags: ["pptx", "presentation", "skill-pack"],
        },
        packagePath: "builtin://pptx",
        requiredTools: [
          "list_skill_resources",
          "read_skill_resource",
          "pptx_extract_text",
          "pptx_analyze_template",
          "pptx_create_deck",
        ],
        resourceRefs,
        scriptPolicy: { enabled: false },
        reviewStatus: "approved",
        visibility: "public",
        publishedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  await installBuiltInAgentSkills(
    path.resolve(process.cwd(), "data", "skills", "builtin"),
    owner.id
  );
  await seedDashiPptSkill(owner.id);
  return true;
}

async function seedDashiPptSkill(ownerId: string) {
  const packagePath = path.resolve(process.cwd(), "data", "skills", "dashi-ppt");
  const upstreamInstructions = await readFile(path.join(packagePath, "SKILL.md"), "utf-8").catch(
    () => null
  );
  if (!upstreamInstructions) return;

  const instructions = [
    "你是 LinHub 中的 Dashi PPT 演示文稿助手，使用 Dashi PPT v0.4.4 的主题和版式运行时生成演示文稿。",
    "开始制作前确认主题风格和是否需要图片/视频；只有用户明确说全部由你决定时才自行选择。默认约 10 页，至少 8 页。",
    "先按每页的信息角色调用 dashi_query_layouts 查询候选版式。复杂字段、数组、图表或媒体版式必须再调用 dashi_inspect_layouts，严格按返回的 copyKeys、fillPlan、propShapes 和长度预算填写 props。",
    "一个 deck 只能从当前主题前 5 个版式中选择 1 个封面；正文使用第 6 页之后的版式；所有 slides.layout 必须唯一。",
    "每页只表达一个主要信息角色，所有可见模板文案都必须替换成用户主题内容，不得残留示例文案。",
    "默认输出 PPTX；用户明确要求浏览器可编辑 HTML ��，将 format 设为 html。最后调用 dashi_render_deck 完成安全修正、规范校验、渲染和导出。",
    "不要调用 run_skill_script，也不要声称已经生成文件，除非 dashi_render_deck 返回了附件。",
    "可选主题：theme01 轻拟态、theme02 炫光紫绿、theme03 深浅代码、theme04 玻璃糖果、theme05 色谱图表、theme06 深色图谱、theme07 冷白调研、theme08 黑金实验、theme09 深蓝杂志、theme10 金色指数、theme11 高能增长、theme12 声波霓虹。普通自动选择不使用 theme10。",
  ].join("\n");

  await db
    .insert(schema.skills)
    .values({
      id: DASHI_PPT_SKILL_ID,
      ownerId,
      name: "Dashi PPT 渲染运行时",
      emoji: "🎞️",
      description:
        "PPT 工作室使用的 Dashi v0.4.4 后端渲染运行时，不作为独立用户入口。来源：chuspeeism/dashi-ppt-skill。",
      systemPrompt: instructions,
      kind: "pack",
      version: "0.4.4",
      source: "chuspeeism/dashi-ppt-skill",
      manifest: {
        id: "dashi-ppt",
        title: "Dashi PPT",
        version: "0.4.4",
        license: "AGPL-3.0",
        sourceUrl: "https://github.com/chuspeeism/dashi-ppt-skill",
        tags: ["ppt", "pptx", "presentation", "html-deck", "skill-pack"],
      },
      packagePath,
      requiredTools: [
        "list_skill_resources",
        "read_skill_resource",
        "dashi_query_layouts",
        "dashi_inspect_layouts",
        "dashi_render_deck",
      ],
      resourceRefs: [
        {
          id: "dashi-ppt-upstream-skill",
          name: "Dashi PPT 上游技能说明",
          kind: "instruction",
          description: "上游 v0.4.4 SKILL.md；包含主题、版式、字段和生成工作流。",
          mimeType: "text/markdown",
          size: upstreamInstructions.length,
          content: upstreamInstructions.slice(0, 50_000),
        },
      ],
      scriptPolicy: { enabled: false },
      reviewStatus: "approved",
      visibility: "private",
    })
    .onConflictDoUpdate({
      target: schema.skills.id,
      set: {
        name: "Dashi PPT 渲染运行时",
        emoji: "🎞️",
        description:
          "PPT 工作室使用的 Dashi v0.4.4 后端渲染运行时，不作为独立用户入口。来源：chuspeeism/dashi-ppt-skill。",
        systemPrompt: instructions,
        kind: "pack",
        version: "0.4.4",
        source: "chuspeeism/dashi-ppt-skill",
        manifest: {
          id: "dashi-ppt",
          title: "Dashi PPT",
          version: "0.4.4",
          license: "AGPL-3.0",
          sourceUrl: "https://github.com/chuspeeism/dashi-ppt-skill",
          tags: ["ppt", "pptx", "presentation", "html-deck", "skill-pack"],
        },
        packagePath,
        requiredTools: [
          "list_skill_resources",
          "read_skill_resource",
          "dashi_query_layouts",
          "dashi_inspect_layouts",
          "dashi_render_deck",
        ],
        resourceRefs: [
          {
            id: "dashi-ppt-upstream-skill",
            name: "Dashi PPT 上游技能说明",
            kind: "instruction",
            description: "上游 v0.4.4 SKILL.md；包含主题、版式、字段和生成工作流。",
            mimeType: "text/markdown",
            size: upstreamInstructions.length,
            content: upstreamInstructions.slice(0, 50_000),
          },
        ],
        scriptPolicy: { enabled: false },
        reviewStatus: "approved",
        visibility: "private",
        publishedAt: null,
        updatedAt: new Date(),
      },
    });
}

export function composeSkillPackPrompt(skill: SkillRow) {
  const tools = Array.from(
    new Set([...(skill.enabledTools ?? []), ...(skill.requiredTools ?? [])])
  );
  const resources = (skill.resourceRefs ?? []) as SkillResourceRef[];
  const lines = [
    `当前启用 Skill Pack：「${skill.name}」 v${skill.version ?? "1.0.0"}。`,
    `来源：${skill.source ?? "user"}；审核状态：${skill.reviewStatus ?? "approved"}。`,
    "",
    "Skill instructions:",
    skill.systemPrompt,
  ];
  if (tools.length > 0) {
    lines.push("", `该技能声明的工具：${tools.join(", ")}。`);
  }
  if (resources.length > 0) {
    lines.push(
      "",
      "该技能包含资源，可用 list_skill_resources 查看，必要时用 read_skill_resource 读取：",
      ...resources.map((r) => `- ${r.id}: ${r.name}${r.description ? ` — ${r.description}` : ""}`)
    );
  }
  return lines.join("\n");
}

export function mergeSkillToggles(
  base: ChatToolToggles | undefined,
  skill: SkillRow | undefined
): ChatToolToggles {
  const merged: ChatToolToggles = {
    autoRouting: base?.autoRouting ?? true,
    webSearch: base?.webSearch ?? false,
    imageGeneration: base?.imageGeneration ?? false,
    codeRunner: base?.codeRunner ?? false,
    knowledgeSearch: base?.knowledgeSearch ?? true,
    mcpServerIds: [...(base?.mcpServerIds ?? [])],
    knowledgeBaseIds: [...(base?.knowledgeBaseIds ?? [])],
  };
  if (!skill) return merged;

  const tools = new Set<ToolName>([
    ...((skill.enabledTools ?? []) as ToolName[]),
    ...((skill.requiredTools ?? []) as ToolName[]),
  ]);
  if (tools.has("web_search") || tools.has("web_read")) merged.webSearch = true;
  if (tools.has("run_code")) merged.codeRunner = true;
  if (tools.has("generate_image") || tools.has("edit_image")) {
    merged.imageGeneration = true;
  }
  if (tools.has("search_knowledge")) merged.knowledgeSearch = true;
  merged.knowledgeBaseIds = Array.from(
    new Set([...merged.knowledgeBaseIds, ...((skill.knowledgeBaseIds ?? []) as string[])])
  );
  return merged;
}

export function skillCanRunScripts(skill: SkillRow) {
  const policy = normalizeScriptPolicy(skill.scriptPolicy);
  return (
    skill.kind === "pack" &&
    skill.reviewStatus === "approved" &&
    policy.enabled === true &&
    (skill.source === "LinHub native" || skill.visibility === "public")
  );
}

export function listSkillResources(skill: SkillRow) {
  return ((skill.resourceRefs ?? []) as SkillResourceRef[]).map((resource) => ({
    id: resource.id,
    name: resource.name,
    kind: resource.kind,
    description: resource.description,
    mimeType: resource.mimeType,
    size: resource.size ?? resource.content?.length,
  }));
}

export async function readSkillResource(skill: SkillRow, resourceId: string) {
  const resource = ((skill.resourceRefs ?? []) as SkillResourceRef[]).find(
    (r) => r.id === resourceId
  );
  if (!resource) throw new Error("技能资源不存在");
  if (typeof resource.content === "string") {
    return {
      id: resource.id,
      name: resource.name,
      mimeType: resource.mimeType ?? "text/plain",
      text: resource.content.slice(0, 50_000),
    };
  }
  if (!resource.path || !skill.packagePath || skill.packagePath.startsWith("builtin://")) {
    throw new Error("该技能资源没有可读取的文件内容");
  }
  // Agent Skills 资源路径相对 Skill 根目录，兼容 references/、assets/ 等标准目录。
  const root = path.resolve(skill.packagePath);
  const target = path.resolve(root, resource.path);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error("技能资源路径越权，已拒绝读取");
  }
  const text = await readFile(target, "utf-8");
  return {
    id: resource.id,
    name: resource.name,
    mimeType: resource.mimeType ?? "text/plain",
    text: text.slice(0, 50_000),
  };
}

export async function runSkillScript(
  skill: SkillRow,
  script: string,
  input: Record<string, unknown> = {}
) {
  if (!skillCanRunScripts(skill)) {
    throw new Error("该技能未通过脚本执行审核，不能运行脚本");
  }
  if (!skill.packagePath || skill.packagePath.startsWith("builtin://")) {
    throw new Error("该技能没有可执行脚本包");
  }
  const policy = normalizeScriptPolicy(skill.scriptPolicy);
  const allowed = new Set(policy.allowedScripts ?? []);
  if (!allowed.has(script)) throw new Error("脚本未在技能清单中声明，已拒绝执行");

  const scriptsRoot = path.resolve(skill.packagePath, "scripts");
  const scriptPath = path.resolve(scriptsRoot, script);
  if (!scriptPath.startsWith(scriptsRoot + path.sep) && scriptPath !== scriptsRoot) {
    throw new Error("脚本路径越权，已拒绝执行");
  }

  const workdir = await mkdtemp(path.join(os.tmpdir(), "linhub-skill-"));
  const startedAt = Date.now();
  try {
    const result = await spawnScript(scriptPath, workdir, input, policy);
    console.info("skill_script_audit", {
      skillId: skill.id,
      script,
      durationMs: Date.now() - startedAt,
      exitCode: result.exitCode,
      stdout: result.stdout.slice(0, 500),
      stderr: result.stderr.slice(0, 500),
    });
    if (result.exitCode !== 0) {
      throw new Error(`脚本执行失败（退出码 ${result.exitCode}）：${result.stderr || result.stdout}`);
    }
    return {
      text: result.stdout || "脚本执行完成",
      exitCode: result.exitCode,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

function normalizeScriptPolicy(value: unknown): SkillScriptPolicy {
  if (!value || typeof value !== "object") return { enabled: false };
  const policy = value as SkillScriptPolicy;
  return {
    enabled: policy.enabled === true,
    allowedScripts: Array.isArray(policy.allowedScripts)
      ? policy.allowedScripts.filter((s): s is string => typeof s === "string")
      : [],
    timeoutMs:
      typeof policy.timeoutMs === "number"
        ? Math.min(Math.max(policy.timeoutMs, 1_000), 60_000)
        : DEFAULT_SCRIPT_TIMEOUT_MS,
    network: policy.network === true,
  };
}

function spawnScript(
  scriptPath: string,
  workdir: string,
  input: Record<string, unknown>,
  policy: SkillScriptPolicy
) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [scriptPath], {
        cwd: workdir,
        env: {
          PATH: process.env.PATH ?? "",
          NODE_ENV: "production",
          LINHUB_SKILL_SANDBOX: "1",
          LINHUB_SKILL_NETWORK: policy.network ? "1" : "0",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        if (!settled) {
          settled = true;
          reject(new Error("脚本执行超时，已终止"));
        }
      }, policy.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS);

      const collect = (chunk: Buffer, target: "stdout" | "stderr") => {
        const next = (target === "stdout" ? stdout : stderr) + chunk.toString("utf-8");
        if (next.length > SCRIPT_OUTPUT_LIMIT) {
          child.kill("SIGKILL");
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error("脚本输出过大，已终止"));
          }
          return;
        }
        if (target === "stdout") stdout = next;
        else stderr = next;
      };

      child.stdout.on("data", (chunk: Buffer) => collect(chunk, "stdout"));
      child.stderr.on("data", (chunk: Buffer) => collect(chunk, "stderr"));
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
      });
      child.stdin.end(JSON.stringify(input));
    }
  );
}

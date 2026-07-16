import { generateObject } from "ai";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/server/db";
import {
  assertCanSpend,
  assertModelAccess,
  recordUsage,
} from "@/lib/server/billing";
import { computeCostCents, resolveModel } from "@/lib/server/llm/registry";
import type {
  ChatToolToggles,
  MessagePart,
  RoutingBuiltin,
  ToolRoutingDecision,
} from "@/lib/types";

type SkillRow = typeof schema.skills.$inferSelect;
type McpRow = typeof schema.mcpServers.$inferSelect;

export interface ResolvedToolRouting {
  finalTools: ChatToolToggles;
  enabledBuiltins: Record<RoutingBuiltin, boolean>;
  selectedSkillIds: string[];
  decision: ToolRoutingDecision;
}

interface ToolRoutingInput {
  userId: string;
  conversationId: string;
  userMessageId: string;
  userText: string;
  messageParts: MessagePart[];
  requestedTools?: ChatToolToggles;
  projectKnowledgeBaseIds: string[];
  isProjectConversation: boolean;
  activeSkillId?: string;
  signal?: AbortSignal;
}

const BUILTIN_LABELS: Record<RoutingBuiltin, string> = {
  webSearch: "联网搜索",
  imageGeneration: "图像生成",
  codeRunner: "代码运行",
  knowledgeSearch: "资料检索",
  spreadsheet: "表格分析",
  vision: "视觉分析",
  artifacts: "Artifacts",
  memory: "记忆",
  pptx: "PPT 技能",
};

const BUILTINS = Object.keys(BUILTIN_LABELS) as RoutingBuiltin[];

const RouterSchema = z.object({
  builtins: z.array(z.enum(BUILTINS as [RoutingBuiltin, ...RoutingBuiltin[]])).default([]),
  mcpServerIds: z.array(z.string()).default([]),
  skillIds: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([]),
});

export async function resolveToolRouting(
  input: ToolRoutingInput
): Promise<ResolvedToolRouting> {
  const requested = normalizeChatToolToggles(input.requestedTools);
  if (!requested.autoRouting) {
    const enabledBuiltins = manualBuiltinPlan(requested);
    return {
      finalTools: { ...requested, autoRouting: false },
      enabledBuiltins,
      selectedSkillIds: [],
      decision: {
        enabled: false,
        source: "manual",
        finalTools: { ...requested, autoRouting: false },
        selectedBuiltins: builtinsFromPlan(enabledBuiltins),
        selectedMcpServerIds: requested.mcpServerIds,
        selectedSkillIds: [],
        labels: [],
        reasons: ["已关闭智能选择，按手动工具开关执行。"],
      },
    };
  }

  const [mcpCandidates, skillCandidates] = await Promise.all([
    loadAccessibleMcpCandidates(input.userId),
    input.activeSkillId ? Promise.resolve([] as SkillRow[]) : loadSkillPackCandidates(input.userId),
  ]);
  const rule = applyRuleRouting(input, requested, mcpCandidates, skillCandidates);
  const model = await tryModelRouting(input, requested, mcpCandidates, skillCandidates, rule);
  const merged = mergeSelections(rule, model, requested, mcpCandidates, skillCandidates);
  const finalTools: ChatToolToggles = {
    ...requested,
    autoRouting: true,
    webSearch: merged.enabledBuiltins.webSearch,
    imageGeneration: merged.enabledBuiltins.imageGeneration,
    codeRunner: merged.enabledBuiltins.codeRunner,
    knowledgeSearch: merged.enabledBuiltins.knowledgeSearch,
    mcpServerIds: merged.mcpServerIds,
  };
  const selectedBuiltins = builtinsFromPlan(merged.enabledBuiltins);
  const labels = buildDecisionLabels(selectedBuiltins, merged.autoMcpRows, merged.skillRows);
  const source =
    model && rule.reasons.length > 0
      ? "mixed"
      : model
        ? "model"
        : "rules";
  return {
    finalTools,
    enabledBuiltins: merged.enabledBuiltins,
    selectedSkillIds: merged.skillRows.map((skill) => skill.id),
    decision: {
      enabled: true,
      source,
      finalTools,
      selectedBuiltins,
      selectedMcpServerIds: merged.mcpServerIds,
      selectedSkillIds: merged.skillRows.map((skill) => skill.id),
      labels,
      reasons: Array.from(new Set([...rule.reasons, ...(model?.reasons ?? [])])).slice(0, 6),
    },
  };
}

export async function persistToolRoutingDecision(
  conversationId: string,
  userMessageId: string,
  originalTools: ChatToolToggles | undefined,
  decision: ToolRoutingDecision
) {
  const [message] = await db
    .select({ parts: schema.messages.parts })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.id, userMessageId),
        eq(schema.messages.conversationId, conversationId)
      )
    )
    .limit(1);
  if (!message) return;
  const parts = [...((message.parts ?? []) as MessagePart[])];
  const index = parts.findIndex((part) => part.type === "tool-config");
  const toolConfig = {
    type: "tool-config" as const,
    tools: decision.finalTools,
    originalTools: originalTools ? normalizeChatToolToggles(originalTools) : undefined,
    routing: decision,
  };
  if (index >= 0) parts[index] = toolConfig;
  else parts.push(toolConfig);
  await db
    .update(schema.messages)
    .set({ parts })
    .where(eq(schema.messages.id, userMessageId));
}

function normalizeChatToolToggles(tools?: ChatToolToggles): ChatToolToggles {
  return {
    autoRouting: tools?.autoRouting ?? true,
    webSearch: tools?.webSearch ?? false,
    imageGeneration: tools?.imageGeneration ?? false,
    codeRunner: tools?.codeRunner ?? false,
    knowledgeSearch: tools?.knowledgeSearch ?? true,
    mcpServerIds: tools?.mcpServerIds ?? [],
    knowledgeBaseIds: tools?.knowledgeBaseIds ?? [],
  };
}

function manualBuiltinPlan(tools: ChatToolToggles): Record<RoutingBuiltin, boolean> {
  return {
    webSearch: tools.webSearch,
    imageGeneration: tools.imageGeneration,
    codeRunner: tools.codeRunner,
    knowledgeSearch: tools.knowledgeSearch,
    spreadsheet: true,
    vision: true,
    artifacts: true,
    memory: true,
    pptx: true,
  };
}

function emptyAutoPlan(): Record<RoutingBuiltin, boolean> {
  return {
    webSearch: false,
    imageGeneration: false,
    codeRunner: false,
    knowledgeSearch: false,
    spreadsheet: false,
    vision: false,
    artifacts: false,
    memory: false,
    pptx: false,
  };
}

function builtinsFromPlan(plan: Record<RoutingBuiltin, boolean>) {
  return BUILTINS.filter((name) => plan[name]);
}

function applyRuleRouting(
  input: ToolRoutingInput,
  requested: ChatToolToggles,
  mcpCandidates: McpRow[],
  skillCandidates: SkillRow[]
) {
  const enabledBuiltins = emptyAutoPlan();
  const selectedMcpIds = new Set<string>();
  const selectedSkillIds = new Set<string>();
  const reasons: string[] = [];
  const text = input.userText;
  const attachments = input.messageParts.filter((part) => part.type === "file");
  const images = input.messageParts.filter((part) => part.type === "image");
  const hasPptx = attachments.some((part) => /\.pptx$/iu.test(part.name));
  const hasSheet = attachments.some((part) =>
    /\.(csv|tsv|xlsx|xls)$/iu.test(part.name)
  );

  if (requested.webSearch && isWebDirectedQuery(text)) {
    enabledBuiltins.webSearch = true;
    reasons.push("用户请求包含最新信息、联网搜索或网页读取意图。");
  }
  if (requested.codeRunner && isCodeExecutionDirectedQuery(text)) {
    enabledBuiltins.codeRunner = true;
    reasons.push("用户请求需要运行或验证代码。");
  }
  if (requested.imageGeneration && isImageDirectedQuery(text)) {
    enabledBuiltins.imageGeneration = true;
    reasons.push("用户请求生成或编辑图片。");
  }
  if (
    requested.knowledgeSearch &&
    (isKnowledgeDirectedQuery(text) ||
      (input.isProjectConversation && isProjectMaterialDirectedQuery(text)))
  ) {
    enabledBuiltins.knowledgeSearch = true;
    reasons.push("用户请求基于知识库、项目资料或已上传文档回答。");
  }
  if (hasSheet || isSpreadsheetDirectedQuery(text)) {
    enabledBuiltins.spreadsheet = true;
    const dataSkill = skillCandidates.find((skill) => skill.id === "skill-data-analyst");
    if (dataSkill && (hasSheet || /数据分析|数据质量|清洗数据|制作?图表|指标趋势/iu.test(text))) {
      selectedSkillIds.add(dataSkill.id);
    }
    reasons.push("用户请求涉及表格文件或复杂表格分析。");
  }
  if (images.length > 0 || isVisionDirectedQuery(text)) {
    enabledBuiltins.vision = true;
    reasons.push("用户上传了图片或请求视觉分析。");
  }
  if (isArtifactDirectedQuery(text)) {
    enabledBuiltins.artifacts = true;
    reasons.push("用户请求创建或更新可交互作品/代码 Artifact。");
  }
  if (isMemoryDirectedQuery(text)) {
    enabledBuiltins.memory = true;
    reasons.push("用户请求保存或检索长期记忆。");
  }
  if (hasPptx || isPptxDirectedQuery(text)) {
    enabledBuiltins.pptx = true;
    enabledBuiltins.artifacts = true;
    const wantsPptCreation = /制作|生成|创建|设计|重做|改写|做一?份|create|generate|build/iu.test(text);
    const preferredPptSkillId = wantsPptCreation ? "skill-ppt-studio" : "skill-pptx-native";
    const pptxSkill = skillCandidates.find((skill) => skill.id === preferredPptSkillId);
    if (pptxSkill) selectedSkillIds.add(pptxSkill.id);
    reasons.push("用户请求涉及 PPTX 文件或演示文稿任务。");
  }

  for (const server of mcpCandidates) {
    if (requested.mcpServerIds.includes(server.id)) continue;
    const haystack = [
      server.name,
      server.url,
      ...(server.tools ?? []).flatMap((tool) => [tool.name, tool.description ?? ""]),
    ].join("\n");
    if (matchesCandidateText(text, haystack)) {
      selectedMcpIds.add(server.id);
      reasons.push(`请求与 MCP「${server.name}」的名称或工具描述匹配。`);
    }
  }

  for (const skill of skillCandidates) {
    if (selectedSkillIds.size > 0) break;
    const haystack = [
      skill.name,
      skill.description,
      skill.systemPrompt.slice(0, 800),
      ...((skill.requiredTools ?? []) as string[]),
      ...((skill.enabledTools ?? []) as string[]),
    ].join("\n");
    if (matchesCandidateText(text, haystack)) {
      selectedSkillIds.add(skill.id);
      reasons.push(`请求与 Skill Pack「${skill.name}」匹配。`);
    }
  }

  return {
    enabledBuiltins,
    selectedMcpIds,
    selectedSkillIds,
    reasons,
  };
}

async function tryModelRouting(
  input: ToolRoutingInput,
  requested: ChatToolToggles,
  mcpCandidates: McpRow[],
  skillCandidates: SkillRow[],
  rule: ReturnType<typeof applyRuleRouting>
): Promise<{ builtins: RoutingBuiltin[]; mcpServerIds: string[]; skillIds: string[]; reasons: string[] } | null> {
  if (!shouldAskRouterModel(input.userText, mcpCandidates, skillCandidates, rule)) {
    return null;
  }

  const [settings] = await db
    .select({ toolRouterModelId: schema.settings.toolRouterModelId })
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"))
    .limit(1);
  if (!settings?.toolRouterModelId) return null;

  try {
    const { model, record } = await resolveModel(settings.toolRouterModelId);
    await assertModelAccess(input.userId, record);
    const prompt = buildRouterPrompt(input, requested, mcpCandidates, skillCandidates);
    await assertCanSpend(
      input.userId,
      computeCostCents(record, { inputTokens: Math.ceil(prompt.length / 3), outputTokens: 180 })
    );

    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    input.signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => abortController.abort(), 4_000);
    try {
      const result = await generateObject({
        model,
        schema: RouterSchema,
        prompt,
        abortSignal: abortController.signal,
        maxOutputTokens: 500,
      });
      const inputTokens = result.usage.inputTokens ?? 0;
      const outputTokens = result.usage.outputTokens ?? 0;
      const costCents = computeCostCents(record, { inputTokens, outputTokens });
      await recordUsage(
        input.userId,
        record,
        input.conversationId,
        { inputTokens, outputTokens, costCents },
        { capability: "tool-router" }
      ).catch(() => null);
      return result.object;
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", onAbort);
    }
  } catch {
    return null;
  }
}

function shouldAskRouterModel(
  text: string,
  mcpCandidates: McpRow[],
  skillCandidates: SkillRow[],
  rule: ReturnType<typeof applyRuleRouting>
) {
  if (text.trim().length < 8) return false;
  if (isLikelyPlainChat(text)) return false;
  if (rule.reasons.length > 0) return false;
  return mcpCandidates.length > 0 || skillCandidates.length > 0;
}

function mergeSelections(
  rule: ReturnType<typeof applyRuleRouting>,
  model:
    | { builtins: RoutingBuiltin[]; mcpServerIds: string[]; skillIds: string[]; reasons: string[] }
    | null,
  requested: ChatToolToggles,
  mcpCandidates: McpRow[],
  skillCandidates: SkillRow[]
) {
  const allowedMcpIds = new Set(mcpCandidates.map((server) => server.id));
  const allowedSkillIds = new Set(skillCandidates.map((skill) => skill.id));
  const enabledBuiltins = { ...rule.enabledBuiltins };

  for (const builtin of model?.builtins ?? []) {
    if (isBuiltinAllowed(builtin, requested)) enabledBuiltins[builtin] = true;
  }

  const autoMcpIds = new Set<string>(rule.selectedMcpIds);
  for (const id of model?.mcpServerIds ?? []) {
    if (allowedMcpIds.has(id)) autoMcpIds.add(id);
  }
  const mcpServerIds = Array.from(
    new Set([
      ...(requested.mcpServerIds ?? []).filter((id) => allowedMcpIds.has(id)),
      ...Array.from(autoMcpIds).filter((id) => allowedMcpIds.has(id)),
    ])
  );

  const skillIds = new Set<string>(rule.selectedSkillIds);
  for (const id of model?.skillIds ?? []) {
    if (allowedSkillIds.has(id) && skillIds.size === 0) skillIds.add(id);
  }
  const skillRows = Array.from(skillIds)
    .flatMap((id) => skillCandidates.find((skill) => skill.id === id) ?? [])
    .slice(0, 1);
  for (const skill of skillRows) {
    const skillTools = new Set([
      ...((skill.enabledTools ?? []) as string[]),
      ...((skill.requiredTools ?? []) as string[]),
    ]);
    if (requested.webSearch && (skillTools.has("web_search") || skillTools.has("web_read"))) {
      enabledBuiltins.webSearch = true;
    }
    if (requested.codeRunner && skillTools.has("run_code")) enabledBuiltins.codeRunner = true;
    if (
      requested.imageGeneration &&
      (skillTools.has("generate_image") || skillTools.has("edit_image"))
    ) {
      enabledBuiltins.imageGeneration = true;
    }
    if (requested.knowledgeSearch && skillTools.has("search_knowledge")) {
      enabledBuiltins.knowledgeSearch = true;
    }
    if (Array.from(skillTools).some((tool) => tool.startsWith("pptx_"))) {
      enabledBuiltins.pptx = true;
      enabledBuiltins.artifacts = true;
    }
  }

  return {
    enabledBuiltins,
    mcpServerIds,
    autoMcpRows: Array.from(autoMcpIds).flatMap(
      (id) => mcpCandidates.find((server) => server.id === id) ?? []
    ),
    skillRows,
  };
}

function isBuiltinAllowed(builtin: RoutingBuiltin, requested: ChatToolToggles) {
  if (builtin === "webSearch") return requested.webSearch;
  if (builtin === "imageGeneration") return requested.imageGeneration;
  if (builtin === "codeRunner") return requested.codeRunner;
  if (builtin === "knowledgeSearch") return requested.knowledgeSearch;
  return true;
}

function buildDecisionLabels(
  builtins: RoutingBuiltin[],
  mcpRows: McpRow[],
  skillRows: SkillRow[]
) {
  const builtinLabels = builtins.map((builtin) => BUILTIN_LABELS[builtin]);
  const mcpLabels = mcpRows.map((server) => `${server.name} MCP`);
  const skillLabels = skillRows.map((skill) => skill.name);
  return Array.from(new Set([...builtinLabels, ...mcpLabels, ...skillLabels])).slice(0, 8);
}

async function loadAccessibleMcpCandidates(userId: string) {
  return db
    .select()
    .from(schema.mcpServers)
    .where(
      and(
        eq(schema.mcpServers.enabled, true),
        or(eq(schema.mcpServers.scope, "global"), eq(schema.mcpServers.ownerId, userId))
      )
    );
}

async function loadSkillPackCandidates(userId: string) {
  return db
    .select()
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.kind, "pack"),
        eq(schema.skills.reviewStatus, "approved"),
        or(eq(schema.skills.ownerId, userId), eq(schema.skills.visibility, "public"))
      )
    );
}

function buildRouterPrompt(
  input: ToolRoutingInput,
  requested: ChatToolToggles,
  mcpCandidates: McpRow[],
  skillCandidates: SkillRow[]
) {
  const fileSummary = input.messageParts
    .filter((part) => part.type === "file")
    .map((part) => `- ${part.name} (${part.mimeType})`)
    .join("\n");
  const imageCount = input.messageParts.filter((part) => part.type === "image").length;
  const allowedBuiltins = BUILTINS.filter((builtin) => isBuiltinAllowed(builtin, requested));
  const mcpSummary = mcpCandidates
    .slice(0, 30)
    .map((server) => {
      const tools = (server.tools ?? [])
        .slice(0, 8)
        .map((tool) => `${tool.name}${tool.description ? `: ${tool.description}` : ""}`)
        .join("; ");
      return `- id=${server.id}; name=${server.name}; tools=${tools || "未发现工具"}`;
    })
    .join("\n");
  const skillSummary = skillCandidates
    .slice(0, 20)
    .map(
      (skill) =>
        `- id=${skill.id}; name=${skill.name}; desc=${skill.description}; tools=${[
          ...((skill.requiredTools ?? []) as string[]),
          ...((skill.enabledTools ?? []) as string[]),
        ].join(", ")}`
    )
    .join("\n");

  return [
    "你是 LinHub 的工具路由器，只输出结构化 JSON。",
    "目标：判断本轮用户请求真正需要哪些工具、MCP 服务器或已审核 Skill Pack。",
    "不要为了普通聊天、写作、解释概念而选择工具。",
    "只能从 allowedBuiltins、MCP candidates、Skill candidates 里选择；用户已关闭的能力不能选择。",
    "",
    `allowedBuiltins: ${allowedBuiltins.join(", ") || "无"}`,
    `manualMcpServerIds: ${(requested.mcpServerIds ?? []).join(", ") || "无"}`,
    `projectKnowledgeBaseIds: ${input.projectKnowledgeBaseIds.join(", ") || "无"}`,
    `imageCount: ${imageCount}`,
    `files:\n${fileSummary || "无"}`,
    "",
    `userMessage:\n${input.userText.slice(0, 4000)}`,
    "",
    `MCP candidates:\n${mcpSummary || "无"}`,
    "",
    `Skill candidates:\n${skillSummary || "无"}`,
  ].join("\n");
}

function matchesCandidateText(text: string, haystack: string) {
  const normalizedText = text.toLowerCase();
  const normalizedHaystack = haystack.toLowerCase();
  const words = normalizedText
    .split(/[\s,，。！？、:：/\\()[\]{}"'`]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
  if (words.some((word) => normalizedHaystack.includes(word))) return true;
  return normalizedHaystack.length > 0 && normalizedText.includes(normalizedHaystack);
}

function isLikelyPlainChat(text: string) {
  return /^(你好|您好|谢谢|多谢|早上好|晚上好|讲个笑话|随便聊聊|你是谁)[。！？!,.，\s]*$/iu.test(
    text.trim()
  );
}

function isWebDirectedQuery(text: string) {
  return /(?:联网|搜索|查一下|查找|网页|网址|链接|http|https|今天|昨日|昨天|本周|最近|最新|新闻|价格|汇率|天气|日程|赛程|当前|现在|实时|资料来源|引用来源)/iu.test(
    text
  );
}

function isKnowledgeDirectedQuery(text: string) {
  return /(?:知识库|资料库|已上传|上传的|附件|文档|报告|私有资料|我的资料|检索资料|基于资料|根据资料)/iu.test(
    text
  );
}

function isProjectMaterialDirectedQuery(text: string) {
  return /(?:项目资料|项目文件|项目文档|本项目|这个项目|项目里的|项目中的)/iu.test(text);
}

function isCodeExecutionDirectedQuery(text: string) {
  return /(?:运行|执行|跑一下|验证).{0,24}(?:代码|脚本|程序|SQL|JavaScript|TypeScript|Python|JS|TS)|(?:run_code|运行结果|执行结果|输出结果)/iu.test(
    text
  );
}

function isSpreadsheetDirectedQuery(text: string) {
  return /(?:CSV|TSV|Excel|XLSX|XLS|电子表格|表格).{0,40}(?:分析|统计|汇总|筛选|计算|图表|透视|可视化)|(?:分析|统计|汇总|筛选|计算).{0,30}(?:CSV|TSV|Excel|表格)/iu.test(
    text
  );
}

export function isVisionDirectedQuery(text: string) {
  return /(?:看图|识图|图片里|图中|截图|照片里|这张图|这张图片|分析图片|描述图片)/iu.test(
    text
  );
}

function isImageDirectedQuery(text: string) {
  if (/(?:SVG|HTML|React|Canvas|Mermaid|流程图|时序图|架构图|ER图|甘特图|图表|表格)/iu.test(text)) {
    return false;
  }
  return /(?:生图|出图|文生图|以图生图|生成图片|生成图像|画一张|绘制图片|做一张|编辑图片|修图|改图|去背景|换背景|抠图)/iu.test(
    text
  );
}

function isArtifactDirectedQuery(text: string) {
  return /(?:创建|生成|实现|写|做|制作|更新).{0,24}(?:Artifact|页面|网页|网站|应用|小工具|组件|HTML|React|Canvas|SVG|Mermaid|流程图|时序图|架构图|ER图|甘特图|图表|代码作品)/iu.test(
    text
  );
}

function isMemoryDirectedQuery(text: string) {
  return /(?:记住|保存到记忆|长期记忆|以后叫我|我的偏好|我之前说过|你还记得)/iu.test(
    text
  );
}

function isPptxDirectedQuery(text: string) {
  return /(?:PPT|PPTX|PowerPoint|演示文稿|幻灯片|slide deck|slides).{0,40}(?:总结|提取|生成|创建|改写|分析|模板|新版|下载)?/iu.test(
    text
  );
}

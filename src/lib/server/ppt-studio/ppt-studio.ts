import "server-only";

import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertCanSpend, recordUsage } from "@/lib/server/billing";
import { db, schema } from "@/lib/server/db";
import {
  inspectDashiLayouts,
  queryDashiLayouts,
  renderDashiDeck,
  type DashiGoalSpec,
} from "@/lib/server/dashi-ppt";
import { computeCostCents, resolveModel } from "@/lib/server/llm/registry";
import {
  isSkillRunCancellationRequested,
  updateSkillRun,
  upsertSkillRunStep,
} from "@/lib/server/skill-runs";
import {
  formatDashiContractIssues,
  selectDashiInspections,
  validateDashiProps,
} from "@/lib/server/ppt-studio/dashi-contract";

const SlideRoleSchema = z.enum([
  "cover",
  "statement",
  "breakdown",
  "transition",
  "context",
  "metrics",
  "trend",
  "comparison",
  "distribution",
  "relationship",
  "case",
  "image",
  "process",
  "risks",
  "observation",
  "ambient",
  "actions",
  "result",
  "team",
  "closing",
]);

type OutlineSlide = {
  role: z.infer<typeof SlideRoleSchema>;
  title: string;
  keyPoints: string[];
};

export async function executePptStudioRun(run: typeof schema.skillRuns.$inferSelect) {
  const brief = parseBrief(run.input);
  const modelId = stringValue(run.input.modelId);
  if (!modelId) throw new Error("PPT 工作室缺少生成模型");
  await assertCanSpend(run.ownerId);
  const resolved = await resolveModel(modelId);
  const [dashiSkill] = await db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.id, "skill-dashi-ppt"))
    .limit(1);
  if (!dashiSkill?.packagePath) {
    throw new Error("Dashi PPT 运行时尚未安装，请管理员安装后重试");
  }

  const controller = new AbortController();
  const cancellationTimer = setInterval(() => {
    void isSkillRunCancellationRequested(run.id).then((requested) => {
      if (requested) controller.abort();
    });
  }, 750);
  const usage = { inputTokens: 0, outputTokens: 0 };
  try {
    await updateSkillRun(run.id, { status: "running", stage: "生成内容大纲", progress: 5 });
    const outlineStep = await upsertSkillRunStep({
      id: `${run.id}-outline`,
      runId: run.id,
      kind: "coordinator",
      label: "生成内容大纲",
      status: "running",
      modelId,
    });
    const outlineResult = await generateObject({
      model: resolved.model,
      schema: z.object({
        deckGoal: z.string().min(5).max(500),
        slides: z
          .array(
            z.object({
              role: SlideRoleSchema,
              title: z.string().min(1).max(80),
              keyPoints: z.array(z.string().min(1).max(180)).min(1).max(6),
            })
          )
          .length(brief.pageCount),
      }),
      prompt: [
        `为“${brief.topic}”设计一份 ${brief.pageCount} 页的演示文稿大纲。`,
        `受众：${brief.audience}；语言：${brief.language === "zh" ? "中文" : "英文"}。`,
        `媒体偏好：${brief.mediaPreference}。第一页必须 role=cover，最后一页必须 role=closing。`,
        "每页只表达一个主要信息角色；中间页根据内容使用 breakdown/context/metrics/trend/comparison/process/actions/result 等不同角色，避免连续重复。",
        brief.additionalInstructions ? `补充要求：${brief.additionalInstructions}` : "",
      ].filter(Boolean).join("\n"),
      abortSignal: controller.signal,
      maxOutputTokens: 4_000,
    });
    usage.inputTokens += outlineResult.usage.inputTokens ?? 0;
    usage.outputTokens += outlineResult.usage.outputTokens ?? 0;
    const outline = enforceOutlineRoles(outlineResult.object.slides);
    await upsertSkillRunStep({
      id: outlineStep,
      runId: run.id,
      kind: "coordinator",
      label: "生成内容大纲",
      status: "completed",
      progress: 100,
      modelId,
      result: { slideCount: outline.length },
    });

    if (controller.signal.aborted) return markCancelled(run.id);
    await updateSkillRun(run.id, { stage: "匹配 Dashi 版式", progress: 25 });
    const layoutStep = await upsertSkillRunStep({
      id: `${run.id}-layouts`,
      runId: run.id,
      kind: "tool",
      label: "匹配 Dashi 版式",
      status: "running",
    });
    const layouts = await chooseLayouts(
      dashiSkill,
      outline,
      brief.theme,
      brief.mediaPreference === "image-heavy"
    );
    const inspections = [];
    for (let index = 0; index < layouts.length; index += 12) {
      inspections.push(
        await inspectDashiLayouts(dashiSkill, layouts.slice(index, index + 12))
      );
    }
    await upsertSkillRunStep({
      id: layoutStep,
      runId: run.id,
      kind: "tool",
      label: "匹配 Dashi 版式",
      status: "completed",
      progress: 100,
      result: { layouts },
    });

    if (controller.signal.aborted) return markCancelled(run.id);
    await updateSkillRun(run.id, { stage: "填写页面内容", progress: 48 });
    const contentStep = await upsertSkillRunStep({
      id: `${run.id}-content`,
      runId: run.id,
      kind: "coordinator",
      label: "填写页面内容",
      status: "running",
      modelId,
    });
    const slides: DashiGoalSpec["slides"] = [];
    for (let start = 0; start < outline.length; start += 5) {
      const chunkOutline = outline.slice(start, start + 5);
      const chunkLayouts = layouts.slice(start, start + 5);
      const chunkInspections = selectDashiInspections(inspections, chunkLayouts);
      const filled = await generateDashiSlideChunk({
        model: resolved.model,
        outline: chunkOutline,
        layouts: chunkLayouts,
        inspections: chunkInspections,
        language: brief.language,
        slideOffset: start,
        signal: controller.signal,
      });
      usage.inputTokens += filled.usage.inputTokens;
      usage.outputTokens += filled.usage.outputTokens;
      filled.slides.forEach((props, index) => {
        slides.push({
          layout: chunkLayouts[index],
          props,
        });
      });
      await updateSkillRun(run.id, {
        stage: `填写页面内容（${Math.min(start + 5, outline.length)}/${outline.length}）`,
        progress: 48 + Math.round((Math.min(start + 5, outline.length) / outline.length) * 27),
      });
    }
    await upsertSkillRunStep({
      id: contentStep,
      runId: run.id,
      kind: "coordinator",
      label: "填写页面内容",
      status: "completed",
      progress: 100,
      modelId,
    });

    if (controller.signal.aborted) return markCancelled(run.id);
    await updateSkillRun(run.id, { stage: "校验并渲染演示文稿", progress: 80 });
    const renderStep = await upsertSkillRunStep({
      id: `${run.id}-render`,
      runId: run.id,
      kind: "artifact",
      label: "校验并渲染演示文稿",
      status: "running",
    });
    const goal: DashiGoalSpec = {
      title: brief.topic,
      goal: outlineResult.object.deckGoal,
      audience: brief.audience,
      randomSeed: run.id,
      pageCount: brief.pageCount,
      themePack: brief.theme,
      language: brief.language,
      slides,
    };
    const rendered = await renderDashiDeck(
      dashiSkill,
      run.ownerId,
      goal,
      brief.outputFormat,
      controller.signal
    );
    if (controller.signal.aborted) return markCancelled(run.id);
    await upsertSkillRunStep({
      id: renderStep,
      runId: run.id,
      kind: "artifact",
      label: "校验并渲染演示文稿",
      status: "completed",
      progress: 100,
      result: { attachmentCount: rendered.attachments.length },
    });
    await recordUsage(
      run.ownerId,
      resolved.record,
      run.conversationId,
      { ...usage, costCents: computeCostCents(resolved.record, usage) },
      { allowDebt: true, capability: "subagent" }
    );
    await updateSkillRun(run.id, {
      status: "completed",
      stage: "PPT 已生成",
      progress: 100,
      result: { attachments: rendered.attachments, slideCount: slides.length },
      error: null,
    });
  } finally {
    clearInterval(cancellationTimer);
  }
}

type GenerateModel = Parameters<typeof generateObject>[0]["model"];

/**
 * 模型输出必须先通过 inspect-layout 的机器契约，才允许进入 Dashi 渲染器。
 * 首次不合规时把结构化问题交给模型修正一次；规则完全来自契约，不包含版式特例。
 */
async function generateDashiSlideChunk(input: {
  model: GenerateModel;
  outline: OutlineSlide[];
  layouts: string[];
  inspections: unknown[];
  language: "zh" | "en";
  slideOffset: number;
  signal: AbortSignal;
}) {
  const contracts = selectDashiInspections(input.inspections, input.layouts);
  const schema = z.object({
    slides: z
      .array(
        z.object({
          propsJson: z
            .string()
            .min(2)
            .max(50_000)
            .describe("当前页面 props 的严格 JSON 对象字符串"),
        })
      )
      .length(input.outline.length),
  });
  const usage = { inputTokens: 0, outputTokens: 0 };
  let repairContext = "";
  let lastIssues = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const generated = await generateObject({
      model: input.model,
      schema,
      prompt: [
        "根据页面大纲和 Dashi 字段契约填写每页 propsJson。每个 propsJson 必须是可被 JSON.parse 解析的对象字符串，并与指定 layouts 按下标一一对应。",
        "只写 fillPlan/propShapes 允许的文案、数组和公开 count 字段，不写样式字段。",
        "契约中的 enum 是渲染器结构令牌，必须逐字使用，禁止翻译或改写；面向用户的状态文案写入对应 Labels 字段。",
        "严格遵守 maxChars、硬 numericBounds、数组长度和 count 约束。所有可见示例文案都要替换。数字和事实只能来自用户主题与补充要求，不得编造来源。",
        `语言：${input.language}。`,
        `页面大纲：${JSON.stringify(input.outline)}`,
        `指定 layouts：${JSON.stringify(input.layouts)}`,
        `字段契约：${JSON.stringify(contracts).slice(0, 100_000)}`,
        repairContext,
      ].filter(Boolean).join("\n"),
      abortSignal: input.signal,
      maxOutputTokens: 6_000,
    });
    usage.inputTokens += generated.usage.inputTokens ?? 0;
    usage.outputTokens += generated.usage.outputTokens ?? 0;

    const slides: Record<string, unknown>[] = [];
    const issues: string[] = [];
    generated.object.slides.forEach((slide, index) => {
      const parsed = tryParsePropsJson(slide.propsJson);
      const page = input.slideOffset + index + 1;
      if (!parsed.ok) {
        issues.push(`第 ${page} 页 ${input.layouts[index]}：${parsed.error}`);
        return;
      }
      slides[index] = parsed.props;
      const contractIssues = validateDashiProps(parsed.props, contracts[index]);
      if (contractIssues.length > 0) {
        issues.push(
          `第 ${page} 页 ${input.layouts[index]}：${formatDashiContractIssues(contractIssues)}`
        );
      }
    });
    if (issues.length === 0 && slides.length === input.layouts.length) {
      return { slides, usage };
    }

    lastIssues = issues.join("\n");
    repairContext = [
      "上一版页面字段未通过 Dashi 机器契约。只修复列出的问题，仍需返回全部页面：",
      lastIssues,
      "上一版 propsJson：",
      generated.object.slides
        .map((slide, index) => `${input.layouts[index]}: ${slide.propsJson.slice(0, 6_000)}`)
        .join("\n"),
    ].join("\n");
  }
  throw new Error(`Dashi 页面内容连续两次未通过字段契约：${lastIssues.slice(0, 1_500)}`);
}

async function chooseLayouts(
  skill: typeof schema.skills.$inferSelect,
  outline: OutlineSlide[],
  theme: string,
  imageHeavy: boolean
) {
  const roles = Array.from(new Set(outline.map((slide) => slide.role)));
  const candidates = new Map<string, DashiLayoutCandidate[]>();
  await Promise.all(
    roles.map(async (role) => {
      const result = await queryDashiLayouts(skill, {
        theme,
        role,
        limit: 12,
        needsMedia: imageHeavy && (role === "image" || role === "case" || role === "ambient"),
      });
      candidates.set(role, layoutCandidates(result));
    })
  );
  const options = outline.map((slide) =>
    (candidates.get(slide.role) ?? [])
      .filter((candidate) =>
        slide.role === "cover"
          ? candidate.roles.includes("cover") || candidate.slot.startsWith("cover")
          : !candidate.roles.includes("cover") && !candidate.slot.startsWith("cover")
      )
      .map((candidate) => candidate.layout)
  );
  const assignment = matchUniqueLayouts(options);
  const missingIndex = assignment.findIndex((layout) => !layout);
  if (missingIndex >= 0) {
    throw new Error(
      `Dashi 主题 ${theme} 没有足够的「${outline[missingIndex].role}」唯一版式`
    );
  }
  return assignment as string[];
}

/**
 * Dashi 版式可声明多个角色。简单按页贪心会先占用后续页面唯一可用的版式，
 * 因此用稳定的二分匹配寻找「页面 -> 唯一版式」组合。
 */
function matchUniqueLayouts(options: string[][]) {
  const slideByLayout = new Map<string, number>();
  const slideOrder = options
    .map((layouts, index) => ({ index, count: layouts.length }))
    .sort((left, right) => left.count - right.count || left.index - right.index);

  const assign = (slideIndex: number, seen: Set<string>): boolean => {
    for (const layout of options[slideIndex]) {
      if (seen.has(layout)) continue;
      seen.add(layout);
      const previousSlide = slideByLayout.get(layout);
      if (previousSlide !== undefined && !assign(previousSlide, seen)) continue;
      slideByLayout.set(layout, slideIndex);
      return true;
    }
    return false;
  };

  for (const slide of slideOrder) assign(slide.index, new Set());
  const assignedBySlide: Array<string | undefined> = Array(options.length);
  for (const [layout, slideIndex] of slideByLayout) {
    assignedBySlide[slideIndex] = layout;
  }
  return assignedBySlide;
}

type DashiLayoutCandidate = {
  layout: string;
  roles: string[];
  slot: string;
};

function layoutCandidates(value: unknown): DashiLayoutCandidate[] {
  if (!value || typeof value !== "object") return [];
  const layouts = (value as { layouts?: unknown }).layouts;
  if (!Array.isArray(layouts)) return [];
  return layouts.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as {
      layout?: unknown;
      roles?: unknown;
      slot?: unknown;
    };
    if (
      typeof candidate.layout !== "string" ||
      !/^theme\d{2}_page\d{3}$/u.test(candidate.layout)
    ) {
      return [];
    }
    return [
      {
        layout: candidate.layout,
        roles: Array.isArray(candidate.roles)
          ? candidate.roles.filter((role): role is string => typeof role === "string")
          : [],
        slot: typeof candidate.slot === "string" ? candidate.slot.toLowerCase() : "",
      },
    ];
  });
}

function enforceOutlineRoles(slides: OutlineSlide[]) {
  return slides.map((slide, index) => ({
    ...slide,
    role:
      index === 0
        ? ("cover" as const)
        : index === slides.length - 1
          ? ("closing" as const)
          : slide.role === "cover" || slide.role === "closing"
            ? ("statement" as const)
            : slide.role,
  }));
}

function parseBrief(input: Record<string, unknown>) {
  const schema = z.object({
    topic: z.string().min(2).max(200),
    audience: z.string().min(1).max(200),
    pageCount: z.number().int().min(3).max(30),
    theme: z.string().regex(/^theme(?:0[1-9]|1[0-2])$/u),
    mediaPreference: z.enum(["auto", "image-heavy", "text-first", "no-media"]),
    language: z.enum(["zh", "en"]),
    outputFormat: z.enum(["pptx", "html"]),
    additionalInstructions: z.string().max(1_000).optional(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error("PPT 工作室需求信息不完整，请重新填写");
  return parsed.data;
}

function tryParsePropsJson(
  value: string
): { ok: true; props: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ok: false, error: "propsJson 不是有效 JSON 对象" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "propsJson 必须是 JSON 对象" };
  }
  return { ok: true, props: parsed as Record<string, unknown> };
}

async function markCancelled(runId: string) {
  await updateSkillRun(runId, { status: "cancelled", stage: "已停止", progress: 100 });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

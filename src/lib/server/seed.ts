import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { ensureSkillRuntimeReady } from "./skill-runtime";

let seeded = false;
let seedInFlight: Promise<void> | null = null;

/** 幂等初始化：内置风格、默认供应商与模型、全局设置、默认套餐 */
export async function ensureSeeded() {
  await ensureSettingsColumns();
  await ensureSkillRuntimeReady();
  if (seeded) return;
  if (seedInFlight) return seedInFlight;

  seedInFlight = seedDatabase().finally(() => {
    seedInFlight = null;
  });
  return seedInFlight;
}

async function seedDatabase() {
  await ensureSettingsColumns();
  await ensureSkillRuntimeReady();
  const [existingSettings] = await db
    .select({ id: schema.settings.id })
    .from(schema.settings)
    .limit(1);
  if (existingSettings) {
    seeded = true;
    return;
  }

  await db.transaction(async (tx) => {
    await tx.insert(schema.settings).values({ id: "global" }).onConflictDoNothing();

    await tx
      .insert(schema.styles)
      .values([
        { id: "style-normal", name: "标准", description: "默认平衡的回复风格", builtIn: true },
        { id: "style-concise", name: "简洁", description: "简短直接，直击要点", prompt: "回答尽量简短直接，省略铺垫，直击要点。", builtIn: true },
        { id: "style-explanatory", name: "详解", description: "耐心展开，适合学习", prompt: "回答要详细展开，循序渐进，多用例子帮助理解。", builtIn: true },
        { id: "style-formal", name: "正式", description: "严谨书面语，适合商务", prompt: "使用严谨正式的书面语，结构清晰，避免口语化表达。", builtIn: true },
      ])
      .onConflictDoNothing();

    const providers = [
      { id: "pv-openai", kind: "openai" as const, name: "OpenAI" },
      { id: "pv-anthropic", kind: "anthropic" as const, name: "Anthropic" },
      { id: "pv-google", kind: "google" as const, name: "Google Gemini" },
      { id: "pv-zhipu", kind: "zhipu" as const, name: "智谱 GLM" },
      { id: "pv-deepseek", kind: "deepseek" as const, name: "DeepSeek" },
      { id: "pv-xiaomi", kind: "xiaomi" as const, name: "Xiaomi MiMo" },
      { id: "pv-xiaomi-token-plan", kind: "xiaomi-token-plan" as const, name: "Xiaomi MiMo Token Plan" },
    ];
    await tx.insert(schema.providers).values(providers).onConflictDoNothing();

    await tx
      .insert(schema.models)
      .values([
        {
          id: "m-gpt5",
          providerId: "pv-openai",
          slug: "gpt-5.2",
          displayName: "GPT-5.2",
          description: "OpenAI 旗舰模型，综合能力最强",
          capabilities: ["vision", "reasoning", "tools"],
          inputPricePerM: 1750,
          outputPricePerM: 14000,
          contextWindow: 400_000,
          tier: "pro" as const,
        },
        {
          id: "m-claude",
          providerId: "pv-anthropic",
          slug: "claude-sonnet-5",
          displayName: "Claude Sonnet 5",
          description: "写作与编码能力出色，长上下文",
          capabilities: ["vision", "reasoning", "tools"],
          inputPricePerM: 2100,
          outputPricePerM: 10500,
          contextWindow: 1_000_000,
          tier: "pro" as const,
        },
        {
          id: "m-gemini",
          providerId: "pv-google",
          slug: "gemini-3-pro",
          displayName: "Gemini 3 Pro",
          description: "多模态理解强，超长上下文",
          capabilities: ["vision", "reasoning", "tools"],
          inputPricePerM: 875,
          outputPricePerM: 7000,
          contextWindow: 2_000_000,
          tier: "free" as const,
        },
        {
          id: "m-glm",
          providerId: "pv-zhipu",
          slug: "glm-4.7",
          displayName: "GLM-4.7",
          description: "智谱旗舰，原生联网搜索与网页阅读",
          capabilities: ["vision", "reasoning", "tools", "web-search-native"],
          inputPricePerM: 350,
          outputPricePerM: 1400,
          contextWindow: 200_000,
          tier: "free" as const,
        },
        {
          id: "m-deepseek",
          providerId: "pv-deepseek",
          slug: "deepseek-chat",
          displayName: "DeepSeek V4",
          description: "高性价比推理模型",
          capabilities: ["reasoning", "tools"],
          inputPricePerM: 140,
          outputPricePerM: 560,
          contextWindow: 128_000,
          tier: "free" as const,
        },
        {
          id: "m-gpt-image",
          providerId: "pv-openai",
          slug: "gpt-image-2",
          displayName: "GPT Image 2",
          description: "图像生成与编辑",
          capabilities: ["image-generation"],
          inputPricePerM: 700,
          outputPricePerM: 0,
          pricePerImage: 28,
          contextWindow: 32_000,
          tier: "free" as const,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(schema.plans)
      .values([
        {
          id: "plan-free",
          name: "免费版",
          description: "轻度使用，体验全部基础功能",
          priceCentsPerMonth: 0,
          monthlyQuotaCents: 300,
          modelTier: "free" as const,
          features: ["基础模型无限对话", "每月 ¥3 额度", "联网搜索", "代码运行器"],
        },
        {
          id: "plan-standard",
          name: "标准版",
          description: "覆盖日常所有场景",
          priceCentsPerMonth: 2900,
          monthlyQuotaCents: 4000,
          modelTier: "pro" as const,
          features: ["全部模型", "每月 ¥40 额度", "图像生成", "知识库 RAG", "自定义 Skill"],
        },
        {
          id: "plan-pro",
          name: "Pro",
          description: "重度用户与专业工作流",
          priceCentsPerMonth: 7900,
          monthlyQuotaCents: 12000,
          modelTier: "pro" as const,
          features: ["全部模型优先响应", "每月 ¥120 额度", "用户级 MCP", "Artifacts 分享", "优先客服"],
        },
      ])
      .onConflictDoNothing();
  });
  seeded = true;
}

async function ensureSettingsColumns() {
  await db.execute(sql`
    alter table if exists settings
      add column if not exists tool_router_model_id text
  `);
}

/** 供应商是否已配置密钥（决定聊天走真实模型还是提示配置） */
export async function providerConfigured(providerId: string): Promise<boolean> {
  const [p] = await db
    .select({ key: schema.providers.apiKeyEncrypted })
    .from(schema.providers)
    .where(eq(schema.providers.id, providerId))
    .limit(1);
  return !!p?.key;
}

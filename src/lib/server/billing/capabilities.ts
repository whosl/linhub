import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import {
  assertCanSpend,
  recordReservedUsage,
  recordUsage,
  refundSpendReservation,
  reserveSpend,
  type SpendReservation,
  type UsageCapability,
} from "@/lib/server/billing";
import { computeCostCents } from "@/lib/server/llm/registry";

export type BillableCapability = UsageCapability;

export interface BillableResource {
  id: string;
  name: string;
  /** 有 models 行时传入，用于 token/图片计价与兼容旧 API */
  model?: typeof schema.models.$inferSelect;
}

export interface BillableUnits {
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  requestCount?: number;
}

export interface BillableEvent {
  capability: BillableCapability;
  resource: BillableResource;
  conversationId?: string | null;
  units: BillableUnits;
  costCents: number;
}

const CAPABILITY_LABEL: Record<BillableCapability, string> = {
  chat: "对话",
  image: "生图",
  "image-edit": "图片编辑",
  embedding: "向量嵌入",
  tts: "语音合成",
  asr: "语音识别",
  "vision-helper": "辅助识图",
  "web-search": "联网搜索",
  "spreadsheet-analysis": "表格分析",
};

/** 引擎类能力的默认单价（分/次），settings 覆盖 */
const DEFAULT_ENGINE_PRICE: Record<
  "tts" | "asr" | "web-search" | "spreadsheet-analysis",
  number
> = {
  tts: 2,
  asr: 3,
  "web-search": 1,
  "spreadsheet-analysis": 1,
};

export async function getEnginePrices() {
  const [s] = await db
    .select({
      tts: schema.settings.ttsPriceCentsPerRequest,
      asr: schema.settings.asrPriceCentsPerRequest,
      webSearch: schema.settings.webSearchPriceCentsPerRequest,
    })
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"))
    .limit(1);
  return {
    tts: s?.tts ?? DEFAULT_ENGINE_PRICE.tts,
    asr: s?.asr ?? DEFAULT_ENGINE_PRICE.asr,
    "web-search": s?.webSearch ?? DEFAULT_ENGINE_PRICE["web-search"],
  } as const;
}

/** 按能力与用量计算费用（分） */
export async function resolveCapabilityCost(
  capability: BillableCapability,
  resource: BillableResource,
  units: BillableUnits
): Promise<number> {
  if (resource.model) {
    if (capability === "image" || capability === "image-edit") {
      const n = units.imageCount ?? 1;
      return Math.max(0, (resource.model.pricePerImage ?? 30) * n);
    }
    return computeCostCents(resource.model, {
      inputTokens: units.inputTokens ?? 0,
      outputTokens: units.outputTokens ?? 0,
      imageCount: units.imageCount,
    });
  }

  const prices = await getEnginePrices();
  if (capability === "tts") return prices.tts * (units.requestCount ?? 1);
  if (capability === "asr") return prices.asr * (units.requestCount ?? 1);
  if (capability === "web-search")
    return prices["web-search"] * (units.requestCount ?? 1);
  if (capability === "spreadsheet-analysis")
    return (
      DEFAULT_ENGINE_PRICE["spreadsheet-analysis"] * (units.requestCount ?? 1)
    );
  return 0;
}

function toModelLike(
  resource: BillableResource
): typeof schema.models.$inferSelect {
  if (resource.model) return resource.model;
  return {
    id: resource.id,
    providerId: "engine",
    slug: resource.id,
    displayName: resource.name,
    description: null,
    capabilities: [],
    enabled: true,
    inputPricePerM: 0,
    outputPricePerM: 0,
    pricePerImage: null,
    contextWindow: 0,
    maxOutputTokens: null,
    tier: "free",
    sortOrder: 0,
    createdAt: new Date(0),
  } as typeof schema.models.$inferSelect;
}

/** 流式能力预检（不扣费） */
export async function precheckSpend(userId: string, estimateCents: number) {
  await assertCanSpend(userId, estimateCents);
}

/**
 * 流式交付后入账（允许欠费，避免已交付内容逃单）。
 * chat 成功 / abort / error 均应调用。
 */
export async function commitStreamSpend(userId: string, event: BillableEvent) {
  const record = toModelLike(event.resource);
  await recordUsage(
    userId,
    record,
    event.conversationId ?? null,
    {
      inputTokens: event.units.inputTokens ?? 0,
      outputTokens: event.units.outputTokens ?? 0,
      imageCount: event.units.imageCount,
      costCents: event.costCents,
    },
    { allowDebt: true, capability: event.capability }
  );
}

/** 原子能力：先预留 */
export async function beginAtomicSpend(
  userId: string,
  amountCents: number,
  capability: BillableCapability,
  resourceName: string
): Promise<SpendReservation> {
  const label = CAPABILITY_LABEL[capability];
  return reserveSpend(userId, amountCents, `预留${label}「${resourceName}」`);
}

/** 原子能力：成功后补 usage 行（钱已在 begin 扣过） */
export async function commitAtomicSpend(
  userId: string,
  _reservation: SpendReservation,
  event: BillableEvent
) {
  const record = toModelLike(event.resource);
  await recordReservedUsage(
    userId,
    record,
    event.conversationId ?? null,
    {
      inputTokens: event.units.inputTokens ?? 0,
      outputTokens: event.units.outputTokens ?? 0,
      imageCount: event.units.imageCount,
      costCents: event.costCents,
    },
    { capability: event.capability }
  );
}

/** 原子能力：失败退款 */
export async function abortAtomicSpend(
  userId: string,
  reservation: SpendReservation,
  capability: BillableCapability
) {
  const label = CAPABILITY_LABEL[capability];
  await refundSpendReservation(userId, reservation, `${label}失败退款`);
}

/** 引擎资源描述（无 models 行） */
export function engineResource(
  capability: "tts" | "asr" | "web-search" | "spreadsheet-analysis",
  displayName?: string
): BillableResource {
  return {
    id: `engine:${capability}`,
    name: displayName ?? CAPABILITY_LABEL[capability],
  };
}

export function modelResource(
  model: typeof schema.models.$inferSelect
): BillableResource {
  return { id: model.id, name: model.displayName, model };
}

/**
 * 一次性原子计费包装：预检金额 → 预留 → 执行 → 成功入账 / 失败退款。
 */
export async function withAtomicBilling<T>(
  userId: string,
  opts: {
    capability: BillableCapability;
    resource: BillableResource;
    conversationId?: string | null;
    units?: BillableUnits;
    costCents?: number;
  },
  run: () => Promise<T>
): Promise<T> {
  const units = opts.units ?? { requestCount: 1 };
  const costCents =
    opts.costCents ??
    (await resolveCapabilityCost(opts.capability, opts.resource, units));
  if (costCents <= 0) return run();

  const reservation = await beginAtomicSpend(
    userId,
    costCents,
    opts.capability,
    opts.resource.name
  );
  try {
    const result = await run();
    await commitAtomicSpend(userId, reservation, {
      capability: opts.capability,
      resource: opts.resource,
      conversationId: opts.conversationId,
      units,
      costCents,
    });
    return result;
  } catch (e) {
    await abortAtomicSpend(userId, reservation, opts.capability).catch(
      (err) => console.error("[billing] 退款失败", err)
    );
    throw e;
  }
}

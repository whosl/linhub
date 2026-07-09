import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

export type UsageCapability =
  | "chat"
  | "image"
  | "image-edit"
  | "embedding"
  | "tts"
  | "asr"
  | "vision-helper"
  | "web-search"
  | "spreadsheet-analysis";

export interface SpendReservation {
  amountCents: number;
  quotaCents: number;
  balanceCents: number;
  subscriptionId?: string;
}

/** 计费/权限类错误（前端直接展示，不附加管理员排查提示） */
export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

/** 查询用户当前有效订阅（含套餐信息），无则返回 null */
export async function getActiveSubscription(userId: string) {
  const [row] = await db
    .select({ subscription: schema.subscriptions, plan: schema.plans })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        gt(schema.subscriptions.expiresAt, new Date())
      )
    )
    .orderBy(desc(schema.subscriptions.expiresAt))
    .limit(1);
  return row ?? null;
}

/** Pro 模型需有效的 pro 订阅（C8：tier 校验） */
export async function assertModelAccess(
  userId: string,
  record: typeof schema.models.$inferSelect
) {
  if (record.tier !== "pro") return;
  const sub = await getActiveSubscription(userId);
  if (!sub || sub.plan.modelTier !== "pro") {
    throw new BillingError(
      `「${record.displayName}」仅限 Pro 订阅用户使用，请先在「用量与订阅」中订阅`
    );
  }
}

/** 当前可用于消费的额度（订阅剩余额度 + 余额）。 */
export async function getAvailableSpendCents(userId: string) {
  const sub = await getActiveSubscription(userId);
  const quotaLeft = sub
    ? Math.max(0, sub.plan.monthlyQuotaCents - sub.subscription.usedQuotaCents)
    : 0;
  const [user] = await db
    .select({ balance: schema.users.balanceCents })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return quotaLeft + Math.max(0, user?.balance ?? 0);
}

/** 开销前预检：可传入预计最低消费，避免低余额用户拿到高成本流式输出后扣费失败。 */
export async function assertCanSpend(userId: string, minimumCents = 1) {
  if (minimumCents <= 0) return;
  const available = await getAvailableSpendCents(userId);
  if (available < minimumCents) {
    throw new BillingError("余额不足，请先充值或订阅套餐");
  }
}

/**
 * 记录用量并扣费：优先扣订阅额度，剩余扣余额。
 * 额度与余额更新均为原子 SQL（C2：防并发丢更新）。
 */
export async function recordUsage(
  userId: string,
  record: typeof schema.models.$inferSelect,
  conversationId: string | null,
  usage: {
    inputTokens: number;
    outputTokens: number;
    imageCount?: number;
    costCents: number;
  },
  opts: {
    /**
     * 聊天流式响应在扣费前已经交付给用户；如果并发请求导致余额在
     * 预检后被其他请求扣完，仍必须把本次用量入账，避免完整响应免费落库。
     */
    allowDebt?: boolean;
    capability?: UsageCapability;
  } = {}
) {
  const capability = opts.capability ?? (usage.imageCount ? "image" : "chat");
  const run = () =>
    db.transaction(async (tx) => {
      await tx.insert(schema.usageRecords).values({
        id: `ur-${uid()}`,
        userId,
        capability,
        modelId: record.id,
        modelName: record.displayName,
        conversationId: conversationId ?? undefined,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        imageCount: usage.imageCount ?? 0,
        costCents: usage.costCents,
      });
      if (usage.costCents <= 0) return;

      // 1) 优先扣订阅额度：原子更新，LEAST 保证不超过剩余额度
      let remaining = usage.costCents;
      const [sub] = await tx
        .select({
          id: schema.subscriptions.id,
          used: schema.subscriptions.usedQuotaCents,
          expiresAt: schema.subscriptions.expiresAt,
          quota: schema.plans.monthlyQuotaCents,
        })
        .from(schema.subscriptions)
        .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
        .where(
          and(
            eq(schema.subscriptions.userId, userId),
            gt(schema.subscriptions.expiresAt, new Date())
          )
        )
        .orderBy(desc(schema.subscriptions.expiresAt))
        .limit(1);
      if (sub) {
        const [updated] = await tx
          .update(schema.subscriptions)
          .set({
            usedQuotaCents: sql`LEAST(${schema.subscriptions.usedQuotaCents} + ${remaining}, ${sub.quota})`,
          })
          .where(eq(schema.subscriptions.id, sub.id))
          .returning({ used: schema.subscriptions.usedQuotaCents });
        const fromQuota = (updated?.used ?? sub.used) - sub.used;
        remaining -= Math.max(fromQuota, 0);
      }

      // 2) 剩余部分原子扣余额并记账
      // 默认余额必须足额才扣；流式聊天已交付时 allowDebt 允许入账为欠费，
      // 避免并发竞态把完整响应变成免费用量。
      if (remaining > 0) {
        const [updated] = await tx
          .update(schema.users)
          .set({ balanceCents: sql`${schema.users.balanceCents} - ${remaining}` })
          .where(
            opts.allowDebt
              ? eq(schema.users.id, userId)
              : and(eq(schema.users.id, userId), gte(schema.users.balanceCents, remaining))
          )
          .returning({ balance: schema.users.balanceCents });
        if (!updated) throw new BillingError("余额不足，请先充值或订阅套餐");
        await tx.insert(schema.ledger).values({
          id: `lg-${uid()}`,
          userId,
          amountCents: -remaining,
          balanceAfterCents: updated.balance,
          reason: "usage",
          description: `${record.displayName} ${capability}消费`,
        });
      }
    }, { isolationLevel: "serializable" });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await run();
      return;
    } catch (e) {
      if (!isSerializationFailure(e) || attempt === 2) throw e;
    }
  }
}

/** 非流式付费操作（如生图）先原子预留额度，避免上游成功后才发现余额被并发扣光。 */
export async function reserveSpend(
  userId: string,
  amountCents: number,
  description = "预留消费"
): Promise<SpendReservation> {
  if (amountCents <= 0) {
    return { amountCents: 0, quotaCents: 0, balanceCents: 0 };
  }

  const run = () =>
    db.transaction(async (tx) => {
      let remaining = amountCents;
      let quotaCents = 0;
      let subscriptionId: string | undefined;

      const [sub] = await tx
        .select({
          id: schema.subscriptions.id,
          used: schema.subscriptions.usedQuotaCents,
          expiresAt: schema.subscriptions.expiresAt,
          quota: schema.plans.monthlyQuotaCents,
        })
        .from(schema.subscriptions)
        .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
        .where(
          and(
            eq(schema.subscriptions.userId, userId),
            gt(schema.subscriptions.expiresAt, new Date())
          )
        )
        .orderBy(desc(schema.subscriptions.expiresAt))
        .limit(1);

      if (sub) {
        const [updated] = await tx
          .update(schema.subscriptions)
          .set({
            usedQuotaCents: sql`LEAST(${schema.subscriptions.usedQuotaCents} + ${remaining}, ${sub.quota})`,
          })
          .where(eq(schema.subscriptions.id, sub.id))
          .returning({ used: schema.subscriptions.usedQuotaCents });
        quotaCents = Math.max((updated?.used ?? sub.used) - sub.used, 0);
        remaining -= quotaCents;
        if (quotaCents > 0) subscriptionId = sub.id;
      }

      let balanceCents = 0;
      if (remaining > 0) {
        const [updated] = await tx
          .update(schema.users)
          .set({ balanceCents: sql`${schema.users.balanceCents} - ${remaining}` })
          .where(and(eq(schema.users.id, userId), gte(schema.users.balanceCents, remaining)))
          .returning({ balance: schema.users.balanceCents });
        if (!updated) throw new BillingError("余额不足，请先充值或订阅套餐");
        balanceCents = remaining;
        await tx.insert(schema.ledger).values({
          id: `lg-${uid()}`,
          userId,
          amountCents: -balanceCents,
          balanceAfterCents: updated.balance,
          reason: "usage",
          description,
        });
      }

      return {
        amountCents,
        quotaCents,
        balanceCents,
        subscriptionId,
      };
    }, { isolationLevel: "serializable" });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (!isSerializationFailure(e) || attempt === 2) throw e;
    }
  }
  throw new BillingError("余额不足，请先充值或订阅套餐");
}

/** 预留成功但上游失败时退款；只回滚额度/余额，不生成 usage record。 */
export async function refundSpendReservation(
  userId: string,
  reservation: SpendReservation,
  description = "消费失败退款"
) {
  if (reservation.amountCents <= 0) return;
  await db.transaction(async (tx) => {
    if (reservation.quotaCents > 0 && reservation.subscriptionId) {
      await tx
        .update(schema.subscriptions)
        .set({
          usedQuotaCents: sql`GREATEST(${schema.subscriptions.usedQuotaCents} - ${reservation.quotaCents}, 0)`,
        })
        .where(eq(schema.subscriptions.id, reservation.subscriptionId));
    }
    if (reservation.balanceCents > 0) {
      const [updated] = await tx
        .update(schema.users)
        .set({
          balanceCents: sql`${schema.users.balanceCents} + ${reservation.balanceCents}`,
        })
        .where(eq(schema.users.id, userId))
        .returning({ balance: schema.users.balanceCents });
      await tx.insert(schema.ledger).values({
        id: `lg-${uid()}`,
        userId,
        amountCents: reservation.balanceCents,
        balanceAfterCents: updated?.balance ?? 0,
        reason: "refund",
        description,
      });
    }
  });
}

/** 预留消费已成功交付后，补记 usage record；扣费已由 reserveSpend 完成。 */
export async function recordReservedUsage(
  userId: string,
  record: typeof schema.models.$inferSelect,
  conversationId: string | null,
  usage: {
    inputTokens: number;
    outputTokens: number;
    imageCount?: number;
    costCents: number;
  },
  opts: { capability?: UsageCapability } = {}
) {
  await db.insert(schema.usageRecords).values({
    id: `ur-${uid()}`,
    userId,
    capability: opts.capability ?? (usage.imageCount ? "image" : "chat"),
    modelId: record.id,
    modelName: record.displayName,
    conversationId: conversationId ?? undefined,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    imageCount: usage.imageCount ?? 0,
    costCents: usage.costCents,
  });
}

function isSerializationFailure(e: unknown) {
  return (
    !!e &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code?: unknown }).code === "40001"
  );
}

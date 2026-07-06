import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

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
    .where(eq(schema.subscriptions.userId, userId));
  if (!row || row.subscription.expiresAt <= new Date()) return null;
  return row;
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

/** 开销前预检：有可用订阅额度或余额为正才放行（C2：防透支） */
export async function assertCanSpend(userId: string) {
  const sub = await getActiveSubscription(userId);
  if (sub && sub.plan.monthlyQuotaCents - sub.subscription.usedQuotaCents > 0) return;
  const [user] = await db
    .select({ balance: schema.users.balanceCents })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if ((user?.balance ?? 0) <= 0) {
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
  }
) {
  await db.transaction(async (tx) => {
    await tx.insert(schema.usageRecords).values({
      id: `ur-${uid()}`,
      userId,
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
      .where(eq(schema.subscriptions.userId, userId));
    if (sub && sub.expiresAt > new Date()) {
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
    // C2: 用 GREATEST(..., 0) 夹紧下界，防止并发或单次超额把余额扣成负数。
    if (remaining > 0) {
      const [updated] = await tx
        .update(schema.users)
        .set({ balanceCents: sql`GREATEST(${schema.users.balanceCents} - ${remaining}, 0)` })
        .where(eq(schema.users.id, userId))
        .returning({ balance: schema.users.balanceCents });
      await tx.insert(schema.ledger).values({
        id: `lg-${uid()}`,
        userId,
        amountCents: -remaining,
        balanceAfterCents: updated?.balance ?? 0,
        reason: "usage",
        description: `${record.displayName} ${usage.imageCount ? "生图" : "对话"}消费`,
      });
    }
  });
}

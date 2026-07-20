import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { getPaymentProvider } from "@/lib/server/payment/provider";
import {
  idempotentOrderId,
  isValidIdempotencyKey,
} from "@/lib/server/payment/idempotency";
import { rateLimit } from "@/lib/server/rate-limit";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

type OrderRow = typeof schema.orders.$inferSelect;
type PlanRow = typeof schema.plans.$inferSelect;

type OrderInput = {
  kind?: "recharge" | "subscription";
  amountCents?: number;
  planId?: string;
};

/** 创建订单：充值或订阅。客户端操作键保证网络重放不会创建第二笔订单。 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const limited = rateLimit(`orders:${userId}`, 10, 60_000);
  if (limited) return limited;

  const body = (await req.json()) as OrderInput;
  if (body.kind !== "recharge" && body.kind !== "subscription") {
    return Response.json({ error: "订单类型无效" }, { status: 400 });
  }
  const rawIdempotencyKey = req.headers.get("idempotency-key")?.trim() ?? "";
  if (rawIdempotencyKey && !isValidIdempotencyKey(rawIdempotencyKey)) {
    return Response.json({ error: "幂等键格式无效" }, { status: 400 });
  }
  const orderId = rawIdempotencyKey
    ? idempotentOrderId(userId, rawIdempotencyKey)
    : `ord-${uid()}`;

  const existing = rawIdempotencyKey ? await findOrder(orderId) : undefined;
  if (existing) {
    const mismatch = existing.userId !== userId || existing.kind !== body.kind ||
      (body.kind === "recharge" && existing.amountCents !== Math.floor(body.amountCents ?? 0)) ||
      (body.kind === "subscription" && existing.planId !== body.planId);
    if (mismatch) {
      return Response.json(
        { error: "同一幂等键不能用于不同订单" },
        { status: 409 }
      );
    }
    if (existing.status === "paid") return Response.json(orderResponse(existing));
    if (existing.status === "failed" || existing.status === "cancelled") {
      return Response.json(
        { error: "此前订单已结束，请重新发起" },
        { status: 409 }
      );
    }
  }

  let amountCents = existing?.amountCents ?? 0;
  let description = "";
  let plan: PlanRow | undefined;

  if (
    process.env.PAYMENT_MOCK_ENABLED === "true" &&
    process.env.NODE_ENV === "production"
  ) {
    return Response.json(
      { error: "生产环境禁止使用 Mock 支付" },
      { status: 503 }
    );
  }

  if (body.kind === "recharge") {
    if (process.env.PAYMENT_MOCK_ENABLED !== "true") {
      return Response.json(
        { error: "支付渠道暂未开通，请使用卡密兑换或联系管理员" },
        { status: 503 }
      );
    }
    amountCents = existing?.amountCents ?? Math.floor(body.amountCents ?? 0);
    if (amountCents < 100 || amountCents > 1_000_000) {
      return Response.json({ error: "充值金额需在 1 到 10000 元之间" }, { status: 400 });
    }
    description = `余额充值 ¥${(amountCents / 100).toFixed(2)}`;
  } else {
    if (!body.planId) return Response.json({ error: "缺少套餐" }, { status: 400 });
    [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, body.planId));
    if (!plan || (!existing && !plan.enabled)) {
      return Response.json({ error: "套餐不存在" }, { status: 400 });
    }
    amountCents = existing?.amountCents ?? plan.priceCentsPerMonth;
    if (amountCents > 0 && process.env.PAYMENT_MOCK_ENABLED !== "true") {
      return Response.json(
        { error: "支付渠道暂未开通，请使用卡密兑换或联系管理员" },
        { status: 503 }
      );
    }
    description = `订阅「${plan.name}」1 个月`;
  }

  let order = existing;
  if (!order) {
    const inserted = await db
      .insert(schema.orders)
      .values({
        id: orderId,
        userId,
        kind: body.kind,
        amountCents,
        planId: body.kind === "subscription" ? body.planId : undefined,
        status: "pending",
        channel: "mock",
      })
      .onConflictDoNothing()
      .returning();
    order = inserted[0] ?? await findOrder(orderId);
    if (!order) {
      return Response.json({ error: "订单创建失败" }, { status: 500 });
    }
  }

  const provider = getPaymentProvider(order.channel);
  let result: Awaited<ReturnType<typeof provider.createOrder>>;
  try {
    result = await provider.createOrder({
      orderId: order.id,
      userId,
      amountCents: order.amountCents,
      description,
    });
  } catch (error) {
    await db
      .update(schema.orders)
      .set({ status: "failed" })
      .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "pending")));
    console.error("创建支付单失败", error);
    return Response.json({ error: "支付渠道创建订单失败" }, { status: 502 });
  }

  if (result.paid) {
    await settlePaidOrder(order, description, plan);
  }

  const finalOrder = await findOrder(order.id);
  if (!finalOrder) return Response.json({ error: "订单不存在" }, { status: 500 });
  return Response.json(orderResponse(finalOrder, result.payUrl));
}

async function findOrder(orderId: string): Promise<OrderRow | undefined> {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId));
  return order;
}

async function settlePaidOrder(
  order: OrderRow,
  description: string,
  plan: PlanRow | undefined
) {
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.orders)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "pending")))
      .returning();
    if (!claimed) return;

    if (order.kind === "recharge") {
      const [updated] = await tx
        .update(schema.users)
        .set({ balanceCents: sql`${schema.users.balanceCents} + ${order.amountCents}` })
        .where(eq(schema.users.id, order.userId))
        .returning({ balance: schema.users.balanceCents });
      if (!updated) throw new Error("订单用户不存在");
      await tx.insert(schema.ledger).values({
        id: `lg-${uid()}`,
        userId: order.userId,
        amountCents: order.amountCents,
        balanceAfterCents: updated.balance,
        reason: "recharge",
        description,
      });
      return;
    }

    if (!plan) throw new Error("订阅订单缺少套餐");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    await tx
      .insert(schema.subscriptions)
      .values({
        id: `sub-${uid()}`,
        userId: order.userId,
        planId: plan.id,
        startedAt: now,
        expiresAt,
        usedQuotaCents: 0,
      })
      .onConflictDoUpdate({
        target: schema.subscriptions.userId,
        set: { planId: plan.id, startedAt: now, expiresAt, usedQuotaCents: 0 },
      });
  });
}

function orderResponse(order: OrderRow, payUrl?: string) {
  return {
    id: order.id,
    userId: order.userId,
    kind: order.kind,
    amountCents: order.amountCents,
    planId: order.planId ?? undefined,
    status: order.status,
    channel: order.channel,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString(),
    payUrl,
  };
}

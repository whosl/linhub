import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { creditBalance, getPaymentProvider } from "@/lib/server/payment/provider";
import { rateLimit } from "@/lib/server/rate-limit";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/** 创建订单：充值或订阅。当前走 Mock 渠道（创建即支付成功） */
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
  const body = (await req.json()) as {
    kind: "recharge" | "subscription";
    amountCents?: number;
    planId?: string;
  };

  let amountCents = 0;
  let description = "";
  let plan: typeof schema.plans.$inferSelect | undefined;

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
    // C1：mock 渠道创建即到账，未显式开启时禁止充值（生产必须接真实支付）
    if (process.env.PAYMENT_MOCK_ENABLED !== "true") {
      return Response.json(
        { error: "支付渠道暂未开通，请使用卡密兑换或联系管理员" },
        { status: 503 }
      );
    }
    amountCents = Math.floor(body.amountCents ?? 0);
    if (amountCents < 100 || amountCents > 1_000_000) {
      return Response.json({ error: "充值金额需在 1 到 10000 元之间" }, { status: 400 });
    }
    description = `余额充值 ¥${(amountCents / 100).toFixed(2)}`;
  } else {
    if (!body.planId) return Response.json({ error: "缺少套餐" }, { status: 400 });
    [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, body.planId));
    if (!plan?.enabled) return Response.json({ error: "套餐不存在" }, { status: 400 });
    amountCents = plan.priceCentsPerMonth;
    // C1：付费套餐同样受 mock 支付开关限制，0 元套餐放行
    if (amountCents > 0 && process.env.PAYMENT_MOCK_ENABLED !== "true") {
      return Response.json(
        { error: "支付渠道暂未开通，请使用卡密兑换或联系管理员" },
        { status: 503 }
      );
    }
    description = `订阅「${plan.name}」1 个月`;
  }

  const orderId = `ord-${uid()}`;
  await db.insert(schema.orders).values({
    id: orderId,
    userId,
    kind: body.kind,
    amountCents,
    planId: body.planId,
    status: "pending",
    channel: "mock",
  });

  const provider = getPaymentProvider("mock");
  const result = await provider.createOrder({
    orderId,
    userId,
    amountCents,
    description,
  });

  if (result.paid) {
    await db
      .update(schema.orders)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(schema.orders.id, orderId));

    if (body.kind === "recharge") {
      await creditBalance(userId, amountCents, "recharge", description);
    } else if (plan) {
      // 免费套餐 0 元也走这里：写/续订阅
      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      const [existing] = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId));
      if (existing) {
        await db
          .update(schema.subscriptions)
          .set({ planId: plan.id, startedAt: new Date(), expiresAt, usedQuotaCents: 0 })
          .where(eq(schema.subscriptions.id, existing.id));
      } else {
        await db.insert(schema.subscriptions).values({
          id: `sub-${uid()}`,
          userId,
          planId: plan.id,
          expiresAt,
        });
      }
    }
  }

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  return Response.json({
    id: order.id,
    userId: order.userId,
    kind: order.kind,
    amountCents: order.amountCents,
    planId: order.planId ?? undefined,
    status: order.status,
    channel: order.channel,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString(),
    payUrl: result.payUrl,
  });
}

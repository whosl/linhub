import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";

/**
 * 支付渠道抽象。接入微信支付/支付宝时实现本接口并在 getPaymentProvider 注册即可，
 * 业务侧（订单创建/回调校验）无需改动。
 */
export interface PaymentProvider {
  readonly channel: "mock" | "wechat" | "alipay";
  /** 创建支付单，返回支付跳转信息（二维码/链接）；mock 渠道直接标记已支付 */
  createOrder(order: {
    orderId: string;
    userId: string;
    amountCents: number;
    description: string;
  }): Promise<{ paid: boolean; payUrl?: string; qrCode?: string }>;
  /** 校验异步回调（微信/支付宝 notify），返回订单号与是否支付成功 */
  verifyCallback(
    payload: unknown
  ): Promise<{ orderId: string; paid: boolean; externalOrderId?: string }>;
  /** 主动查单 */
  queryOrder(orderId: string): Promise<{ paid: boolean }>;
}

/** Mock 渠道：创建即支付成功，用于开发与卡密之外的手动充值演示 */
class MockPaymentProvider implements PaymentProvider {
  readonly channel = "mock" as const;

  async createOrder() {
    return { paid: true };
  }

  async verifyCallback(payload: unknown) {
    const p = payload as { orderId?: string };
    return { orderId: p.orderId ?? "", paid: true };
  }

  async queryOrder(orderId: string) {
    const [order] = await db
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));
    return { paid: order?.status === "paid" };
  }
}

const providers: Record<string, PaymentProvider> = {
  mock: new MockPaymentProvider(),
  // wechat: new WechatPayProvider(),  // 后续实现
  // alipay: new AlipayProvider(),
};

export function getPaymentProvider(channel: string): PaymentProvider {
  const provider = providers[channel];
  if (!provider) throw new Error(`暂不支持的支付渠道：${channel}`);
  return provider;
}

/** 入账：原子加余额 + 记账本（幂等由调用方保证；C2：防并发丢更新） */
export async function creditBalance(
  userId: string,
  amountCents: number,
  reason: "recharge" | "grant" | "redeem" | "refund",
  description: string
) {
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.users)
      .set({ balanceCents: sql`${schema.users.balanceCents} + ${amountCents}` })
      .where(eq(schema.users.id, userId))
      .returning({ balance: schema.users.balanceCents });
    await tx.insert(schema.ledger).values({
      id: `lg-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      userId,
      amountCents,
      balanceAfterCents: updated?.balance ?? 0,
      reason,
      description,
    });
  });
}

import { NextRequest } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/** 卡密兑换：占用、入账、流水和订单必须在同一事务中完成。 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const limited = rateLimit(`redeem:${session.user.id}`, 5, 60_000);
  if (limited) return limited;
  const { code } = (await req.json()) as { code?: string };
  const cleanCode = code?.trim();
  if (!cleanCode) return Response.json({ error: "请输入卡密" }, { status: 400 });

  const amountCents = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.redeemCodes)
      .set({ usedBy: session.user.id, usedAt: new Date() })
      .where(and(eq(schema.redeemCodes.code, cleanCode), isNull(schema.redeemCodes.usedBy)))
      .returning({ amountCents: schema.redeemCodes.amountCents });
    if (!claimed) return null;

    const [updated] = await tx
      .update(schema.users)
      .set({ balanceCents: sql`${schema.users.balanceCents} + ${claimed.amountCents}` })
      .where(eq(schema.users.id, session.user.id))
      .returning({ balance: schema.users.balanceCents });
    if (!updated) throw new Error("兑换用户不存在");

    await tx.insert(schema.ledger).values({
      id: `lg-${uid()}`,
      userId: session.user.id,
      amountCents: claimed.amountCents,
      balanceAfterCents: updated.balance,
      reason: "redeem",
      description: `卡密兑换 ${cleanCode.slice(0, 4)}****`,
    });
    await tx.insert(schema.orders).values({
      id: `ord-${uid()}`,
      userId: session.user.id,
      kind: "recharge",
      amountCents: claimed.amountCents,
      status: "paid",
      channel: "redeem-code",
      paidAt: new Date(),
    });
    return claimed.amountCents;
  });

  if (amountCents === null) {
    return Response.json({ error: "卡密无效或已被使用" }, { status: 400 });
  }
  return Response.json({ amountCents });
}

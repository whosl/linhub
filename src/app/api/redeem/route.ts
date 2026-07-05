import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { creditBalance } from "@/lib/server/payment/provider";

/** 卡密兑换 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { code } = (await req.json()) as { code?: string };
  if (!code?.trim()) return Response.json({ error: "请输入卡密" }, { status: 400 });

  // 原子占用：仅当未被使用时更新
  const updated = await db
    .update(schema.redeemCodes)
    .set({ usedBy: session.user.id, usedAt: new Date() })
    .where(and(eq(schema.redeemCodes.code, code.trim()), isNull(schema.redeemCodes.usedBy)))
    .returning();
  if (updated.length === 0) {
    return Response.json({ error: "卡密无效或已被使用" }, { status: 400 });
  }

  const amountCents = updated[0].amountCents;
  await creditBalance(session.user.id, amountCents, "redeem", `卡密兑换 ${code.trim().slice(0, 4)}****`);
  await db.insert(schema.orders).values({
    id: `ord-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    userId: session.user.id,
    kind: "recharge",
    amountCents,
    status: "paid",
    channel: "redeem-code",
    paidAt: new Date(),
  });
  return Response.json({ amountCents });
}

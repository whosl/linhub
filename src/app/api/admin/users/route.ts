import { NextRequest } from "next/server";
import { desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";

function toSubscription(
  row:
    | {
        planId: string;
        planName: string;
        modelTier: "free" | "pro";
        startedAt: Date;
        expiresAt: Date;
        usedQuotaCents: number;
        monthlyQuotaCents: number;
      }
    | undefined
) {
  if (!row) return undefined;
  return {
    planId: row.planId,
    planName: row.planName,
    modelTier: row.modelTier,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedQuotaCents: row.usedQuotaCents,
    monthlyQuotaCents: row.monthlyQuotaCents,
  };
}

export async function GET() {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt));
  const activeSubscriptions = await db
    .select({
      userId: schema.subscriptions.userId,
      planId: schema.subscriptions.planId,
      planName: schema.plans.name,
      modelTier: schema.plans.modelTier,
      startedAt: schema.subscriptions.startedAt,
      expiresAt: schema.subscriptions.expiresAt,
      usedQuotaCents: schema.subscriptions.usedQuotaCents,
      monthlyQuotaCents: schema.plans.monthlyQuotaCents,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .where(gt(schema.subscriptions.expiresAt, new Date()));
  const subscriptionByUserId = new Map(
    activeSubscriptions.map((s) => [s.userId, s])
  );
  return Response.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.image ?? undefined,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      balance: u.balanceCents,
      subscription: toSubscription(subscriptionByUserId.get(u.id)),
    }))
  );
}

/** 赠送余额 */
export async function POST(req: NextRequest) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const { userId, amountCents, note } = (await req.json()) as {
    userId: string;
    amountCents: number;
    note?: string;
  };
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return Response.json({ error: "金额无效" }, { status: 400 });
  }
  // 原子自增，防并发丢更新（C2）
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.users)
      .set({ balanceCents: sql`${schema.users.balanceCents} + ${amountCents}` })
      .where(eq(schema.users.id, userId))
      .returning({ balance: schema.users.balanceCents });
    if (!updated) throw new Error("用户不存在");
    await tx.insert(schema.ledger).values({
      id: `lg-${crypto.randomUUID().slice(0, 12)}`,
      userId,
      amountCents,
      balanceAfterCents: updated.balance,
      reason: "grant",
      description: note ?? "管理员赠送",
    });
  });
  return Response.json({ ok: true });
}

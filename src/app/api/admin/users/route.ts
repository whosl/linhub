import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";

export async function GET() {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt));
  return Response.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.image ?? undefined,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      balance: u.balanceCents,
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
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ balance: schema.users.balanceCents })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!user) throw new Error("用户不存在");
    const newBalance = user.balance + amountCents;
    await tx
      .update(schema.users)
      .set({ balanceCents: newBalance })
      .where(eq(schema.users.id, userId));
    await tx.insert(schema.ledger).values({
      id: `lg-${crypto.randomUUID().slice(0, 12)}`,
      userId,
      amountCents,
      balanceAfterCents: newBalance,
      reason: "grant",
      description: note ?? "管理员赠送",
    });
  });
  return Response.json({ ok: true });
}

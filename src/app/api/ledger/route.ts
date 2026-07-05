import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.ledger)
    .where(eq(schema.ledger.userId, session.user.id))
    .orderBy(desc(schema.ledger.createdAt))
    .limit(200);

  return Response.json(
    rows.map((e) => ({
      id: e.id,
      userId: e.userId,
      amountCents: e.amountCents,
      balanceAfterCents: e.balanceAfterCents,
      reason: e.reason,
      description: e.description,
      createdAt: e.createdAt.toISOString(),
    }))
  );
}

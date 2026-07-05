import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { getSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const patch = (await req.json()) as { name?: string; avatarUrl?: string };
  await db
    .update(schema.users)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.avatarUrl ? { image: patch.avatarUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, session.user.id));
  return GET();
}

export async function GET() {
  await ensureSeeded();
  const session = await getSession();
  if (!session) return Response.json(null);

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));
  if (!user) return Response.json(null);

  const [sub] = await db
    .select({
      subscription: schema.subscriptions,
      planName: schema.plans.name,
      monthlyQuota: schema.plans.monthlyQuotaCents,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .where(eq(schema.subscriptions.userId, user.id))
    .limit(1);

  return Response.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.image ?? undefined,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    balance: user.balanceCents,
    subscription:
      sub && sub.subscription.expiresAt > new Date()
        ? {
            planId: sub.subscription.planId,
            planName: sub.planName,
            startedAt: sub.subscription.startedAt.toISOString(),
            expiresAt: sub.subscription.expiresAt.toISOString(),
            usedQuotaCents: sub.subscription.usedQuotaCents,
            monthlyQuotaCents: sub.monthlyQuota,
          }
        : undefined,
  });
}

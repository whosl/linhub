import { NextRequest } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { parseBody } from "@/lib/server/validate";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

const SubscriptionPatchSchema = z.object({
  planId: z.string().nullable(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

type UserRouteContext = { params: Promise<{ id: string }> };

async function activeSubscriptionFor(userId: string) {
  const [row] = await db
    .select({ subscription: schema.subscriptions, plan: schema.plans })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        gt(schema.subscriptions.expiresAt, new Date())
      )
    )
    .orderBy(desc(schema.subscriptions.expiresAt))
    .limit(1);
  return row;
}

async function userDetail(userId: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return null;

  const active = await activeSubscriptionFor(userId);
  const usageRecords = await db
    .select()
    .from(schema.usageRecords)
    .where(eq(schema.usageRecords.userId, userId))
    .orderBy(desc(schema.usageRecords.createdAt))
    .limit(100);
  const ledger = await db
    .select()
    .from(schema.ledger)
    .where(eq(schema.ledger.userId, userId))
    .orderBy(desc(schema.ledger.createdAt))
    .limit(100);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.image ?? undefined,
      role: user.role,
      defaultModelId: user.defaultModelId ?? undefined,
      createdAt: user.createdAt.toISOString(),
      balance: user.balanceCents,
      subscription: active
        ? {
            planId: active.subscription.planId,
            planName: active.plan.name,
            modelTier: active.plan.modelTier,
            startedAt: active.subscription.startedAt.toISOString(),
            expiresAt: active.subscription.expiresAt.toISOString(),
            usedQuotaCents: active.subscription.usedQuotaCents,
            monthlyQuotaCents: active.plan.monthlyQuotaCents,
          }
        : undefined,
    },
    usageRecords: usageRecords.map((r) => ({
      id: r.id,
      userId: r.userId,
      capability: r.capability,
      modelId: r.modelId,
      modelName: r.modelName,
      conversationId: r.conversationId ?? undefined,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      imageCount: r.imageCount ?? undefined,
      costCents: r.costCents,
      createdAt: r.createdAt.toISOString(),
    })),
    ledger: ledger.map((e) => ({
      id: e.id,
      userId: e.userId,
      amountCents: e.amountCents,
      balanceAfterCents: e.balanceAfterCents,
      reason: e.reason,
      description: e.description,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function GET(_req: NextRequest, { params }: UserRouteContext) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  const detail = await userDetail(id);
  if (!detail) return Response.json({ error: "用户不存在" }, { status: 404 });
  return Response.json(detail);
}

export async function PATCH(req: NextRequest, { params }: UserRouteContext) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  const body = await parseBody(req, SubscriptionPatchSchema);
  if (body instanceof Response) return body;

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  if (!user) return Response.json({ error: "用户不存在" }, { status: 404 });

  if (body.planId === null) {
    await db
      .delete(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, id));
  } else {
    const [plan] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, body.planId))
      .limit(1);
    if (!plan) return Response.json({ error: "套餐不存在" }, { status: 400 });

    const startedAt = new Date();
    const expiresAt = new Date(
      startedAt.getTime() + (body.expiresInDays ?? 30) * 86_400_000
    );
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, id))
        .limit(1);
      if (existing) {
        await tx
          .update(schema.subscriptions)
          .set({
            planId: plan.id,
            startedAt,
            expiresAt,
            usedQuotaCents: 0,
          })
          .where(eq(schema.subscriptions.id, existing.id));
      } else {
        await tx.insert(schema.subscriptions).values({
          id: `sub-${uid()}`,
          userId: id,
          planId: plan.id,
          startedAt,
          expiresAt,
          usedQuotaCents: 0,
        });
      }
    });
  }

  const detail = await userDetail(id);
  return Response.json(detail);
}

export async function DELETE(_req: NextRequest, { params }: UserRouteContext) {
  const session = await requireAdmin().catch(() => null);
  if (!session) return Response.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  if (id === session.user.id) {
    return Response.json({ error: "不能删除当前登录的管理员账号" }, { status: 400 });
  }
  const [deleted] = await db
    .delete(schema.users)
    .where(eq(schema.users.id, id))
    .returning({ id: schema.users.id });
  if (!deleted) return Response.json({ error: "用户不存在" }, { status: 404 });
  return Response.json({ ok: true });
}

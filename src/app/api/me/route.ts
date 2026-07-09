import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { getSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";
import { getActiveSubscription } from "@/lib/server/billing";

export async function PATCH(req: Request) {
  const session = await getSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const patch = (await req.json()) as {
    name?: string;
    avatarUrl?: string;
    /** 设置个人默认对话模型；传 null 清除 */
    defaultModelId?: string | null;
  };
  if (patch.defaultModelId) {
    const [model] = await db
      .select({
        capabilities: schema.models.capabilities,
        tier: schema.models.tier,
      })
      .from(schema.models)
      .where(
        and(
          eq(schema.models.id, patch.defaultModelId),
          eq(schema.models.enabled, true)
        )
      )
      .limit(1);
    if (
      !model ||
      (model.capabilities as string[]).includes("image-generation")
    ) {
      return Response.json({ error: "默认模型不可用" }, { status: 400 });
    }
    const hasProAccess =
      (await getActiveSubscription(session.user.id))?.plan.modelTier === "pro";
    if (model.tier === "pro" && !hasProAccess) {
      return Response.json(
        { error: "该模型仅限 Pro 订阅用户设为默认" },
        { status: 403 }
      );
    }
  }
  await db
    .update(schema.users)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.avatarUrl ? { image: patch.avatarUrl } : {}),
      ...(patch.defaultModelId !== undefined
        ? { defaultModelId: patch.defaultModelId || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, session.user.id));
  return GET();
}

export async function GET() {
  let session;
  try {
    await ensureSeeded();
    session = await getSession();
  } catch {
    return Response.json(
      { error: "服务器暂时无法连接数据库，请稍后重试" },
      { status: 503 }
    );
  }
  if (!session) return Response.json(null);

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));
  if (!user) return Response.json(null);

  const active = await getActiveSubscription(user.id);

  return Response.json({
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
  });
}

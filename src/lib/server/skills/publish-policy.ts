import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";

export type SkillVisibility = "private" | "pending" | "public";

/**
 * 根据「分享到广场」意图与审核设置，解析技能可见性。
 * 非管理员不能直接设为 public（除非关闭审核）。
 */
export async function resolveSkillVisibility(opts: {
  shareToMarket: boolean;
  isAdmin: boolean;
}): Promise<SkillVisibility> {
  if (!opts.shareToMarket) return "private";

  const [settings] = await db
    .select({ requiresReview: schema.settings.skillMarketRequiresReview })
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"))
    .limit(1);

  const requiresReview = settings?.requiresReview ?? true;
  if (!requiresReview) return "public";
  if (opts.isAdmin) return "public";
  return "pending";
}

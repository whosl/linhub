import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin, requireSession } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const all = req.nextUrl.searchParams.get("all") === "1";
  if (all) {
    const admin = await requireAdmin().catch(() => null);
    if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(schema.usageRecords)
    .where(all ? undefined : eq(schema.usageRecords.userId, session.user.id))
    .orderBy(desc(schema.usageRecords.createdAt))
    .limit(200);

  return Response.json(
    rows.map((r) => ({
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
    }))
  );
}

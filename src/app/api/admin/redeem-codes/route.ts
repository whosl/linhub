import { NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(schema.redeemCodes)
    .orderBy(desc(schema.redeemCodes.createdAt))
    .limit(100);
  return Response.json(
    rows.map((r) => ({
      code: r.code,
      amountCents: r.amountCents,
      used: !!r.usedBy,
      usedAt: r.usedAt?.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }))
  );
}

/** 批量生成卡密：{ amountCents, count } */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  const { amountCents, count } = (await req.json()) as {
    amountCents: number;
    count?: number;
  };
  if (!amountCents || amountCents < 100) {
    return Response.json({ error: "面额至少 1 元" }, { status: 400 });
  }
  const n = Math.min(Math.max(count ?? 1, 1), 50);
  const codes = Array.from({ length: n }, () =>
    `LH-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`
  );
  await db.insert(schema.redeemCodes).values(codes.map((code) => ({ code, amountCents })));
  return Response.json({ codes });
}

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { feedback } = (await req.json()) as {
    feedback: "up" | "down" | null;
  };
  await db
    .update(schema.messages)
    .set({ feedback })
    .where(eq(schema.messages.id, id));
  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/server/crypto";
import { ensureSeeded } from "@/lib/server/seed";

function toUi(p: typeof schema.providers.$inferSelect) {
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    baseUrl: p.baseUrl ?? undefined,
    apiKeyMasked: p.apiKeyEncrypted
      ? maskSecret(decryptSecret(p.apiKeyEncrypted))
      : undefined,
    enabled: p.enabled,
  };
}

export async function GET() {
  await ensureSeeded();
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(schema.providers)
    .orderBy(asc(schema.providers.createdAt));
  return Response.json(rows.map(toUi));
}

export async function POST(req: NextRequest) {
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    id?: string;
    kind: typeof schema.providers.$inferSelect.kind;
    name: string;
    baseUrl?: string;
    apiKey?: string;
    enabled?: boolean;
  };

  if (body.id) {
    const patch: Partial<typeof schema.providers.$inferInsert> = {
      name: body.name,
      baseUrl: body.baseUrl ?? null,
    };
    if (body.apiKey) patch.apiKeyEncrypted = encryptSecret(body.apiKey);
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    await db
      .update(schema.providers)
      .set(patch)
      .where(eq(schema.providers.id, body.id));
    const [row] = await db
      .select()
      .from(schema.providers)
      .where(eq(schema.providers.id, body.id));
    return Response.json(toUi(row));
  }

  const id = `pv-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(schema.providers).values({
    id,
    kind: body.kind,
    name: body.name,
    baseUrl: body.baseUrl,
    apiKeyEncrypted: body.apiKey ? encryptSecret(body.apiKey) : null,
    enabled: body.enabled ?? true,
  });
  const [row] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.id, id));
  return Response.json(toUi(row));
}

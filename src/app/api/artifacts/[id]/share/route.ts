import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { getOwnedArtifact } from "../../util";

/** 生成（或复用）只读分享 token */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const artifact = await getOwnedArtifact(id, session.user.id);
  if (!artifact) return Response.json({ error: "不存在" }, { status: 404 });

  let shareToken = artifact.shareToken;
  if (!shareToken) {
    shareToken = crypto.randomUUID().replace(/-/g, "");
    await db
      .update(schema.artifacts)
      .set({ shareToken })
      .where(eq(schema.artifacts.id, id));
  }
  return Response.json({ shareToken });
}

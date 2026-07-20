import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";

/** 公开只读作品接口，供 Android App Link 和 Web 分享页复用。 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    return Response.json({ error: "分享链接无效" }, { status: 404 });
  }
  const [artifact] = await db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.shareToken, token));
  if (!artifact) {
    return Response.json({ error: "分享作品不存在或已失效" }, { status: 404 });
  }
  return Response.json(
    {
      id: artifact.id,
      conversationId: artifact.conversationId,
      title: artifact.title,
      kind: artifact.kind,
      language: artifact.language ?? undefined,
      versions: artifact.versions,
      currentVersion: artifact.currentVersion,
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString(),
    },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}

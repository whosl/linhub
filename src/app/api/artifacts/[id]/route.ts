import { requireSession } from "@/lib/server/auth";
import { getOwnedArtifact, toUiArtifact } from "../util";

export async function GET(
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
  return Response.json(toUiArtifact(artifact));
}

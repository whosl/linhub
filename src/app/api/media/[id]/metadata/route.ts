import { requireSession } from "@/lib/server/auth";
import { getOwnedMedia, toMediaDto } from "@/lib/server/media";

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
  const asset = await getOwnedMedia(id, session.user.id);
  if (!asset) {
    return Response.json({ error: "不存在" }, { status: 404 });
  }
  return Response.json(toMediaDto(asset));
}

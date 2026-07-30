import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { listMedia, type MediaKind } from "@/lib/server/media";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const kindParam = req.nextUrl.searchParams.get("kind");
  let kind: MediaKind | MediaKind[] | undefined;
  if (kindParam === "upload") kind = "upload";
  else if (kindParam === "generated") kind = ["generated", "edited"];
  else if (kindParam === "edited") kind = "edited";

  const result = await listMedia(session.user.id, {
    kind,
    q: req.nextUrl.searchParams.get("q") ?? undefined,
    cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
    limit: Number(req.nextUrl.searchParams.get("limit") ?? 60) || 60,
  });
  return Response.json(result);
}

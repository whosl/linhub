import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { openMediaStream, verifyMediaSignature } from "@/lib/server/media";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const exp = req.nextUrl.searchParams.get("exp");
  const uid = req.nextUrl.searchParams.get("uid");
  const sig = req.nextUrl.searchParams.get("sig");

  let viewerId: string | null = null;
  if (exp && uid && sig && verifyMediaSignature(id, uid, exp, sig)) {
    viewerId = uid;
  } else {
    try {
      const session = await requireSession();
      viewerId = session.user.id;
    } catch {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }
  }

  const opened = await openMediaStream(id, viewerId);
  if (!opened) {
    return Response.json({ error: "不存在" }, { status: 404 });
  }

  return new Response(new Uint8Array(opened.buffer), {
    headers: {
      "Content-Type": opened.row.mimeType,
      "Content-Length": String(opened.buffer.length),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(opened.row.name)}`,
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const { deleteMedia } = await import("@/lib/server/media");
  const ok = await deleteMedia(id, session.user.id);
  if (!ok) return Response.json({ error: "不存在" }, { status: 404 });
  return Response.json({ ok: true });
}

/** 元数据（可选） */
export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const res = await GET(req, ctx);
  return new Response(null, { status: res.status, headers: res.headers });
}

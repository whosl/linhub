import { requireSession } from "@/lib/server/auth";
import {
  UPLOAD_CHUNK_BYTES,
  writeUploadChunk,
} from "@/lib/server/chunked-upload";
import { rateLimit } from "@/lib/server/rate-limit";
import { UploadFileError } from "@/lib/server/upload";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const limited = rateLimit(`upload-chunk:${session.user.id}`, 120, 60_000);
  if (limited) return limited;

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength > UPLOAD_CHUNK_BYTES) {
    return Response.json({ error: "分块不能超过 1MB" }, { status: 413 });
  }
  const { id, index: rawIndex } = await params;
  const index = Number(rawIndex);
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length > UPLOAD_CHUNK_BYTES) {
    return Response.json({ error: "分块不能超过 1MB" }, { status: 413 });
  }
  try {
    return Response.json(
      await writeUploadChunk(id, session.user.id, index, bytes)
    );
  } catch (error) {
    if (error instanceof UploadFileError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

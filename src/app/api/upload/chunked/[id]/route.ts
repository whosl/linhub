import { requireSession } from "@/lib/server/auth";
import {
  cancelChunkedUpload,
  completeChunkedUpload,
} from "@/lib/server/chunked-upload";
import { rateLimit } from "@/lib/server/rate-limit";
import { UploadFileError } from "@/lib/server/upload";

async function withUploadError(action: () => Promise<unknown>) {
  try {
    return Response.json(await action());
  } catch (error) {
    if (error instanceof UploadFileError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

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
  const limited = rateLimit(`upload-complete:${session.user.id}`, 30, 60_000);
  if (limited) return limited;
  const { id } = await params;
  return withUploadError(() => completeChunkedUpload(id, session.user.id));
}

export async function DELETE(
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
  return withUploadError(() => cancelChunkedUpload(id, session.user.id));
}

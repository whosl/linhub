import { requireSession } from "@/lib/server/auth";
import { beginChunkedUpload } from "@/lib/server/chunked-upload";
import { rateLimit } from "@/lib/server/rate-limit";
import { UploadFileError } from "@/lib/server/upload";

interface BeginUploadBody {
  name?: string;
  mimeType?: string;
  size?: number;
  projectId?: string | null;
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const limited = rateLimit(`upload-init:${session.user.id}`, 30, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as BeginUploadBody | null;
  if (!body || typeof body.name !== "string" || typeof body.size !== "number") {
    return Response.json({ error: "上传参数不完整" }, { status: 400 });
  }
  try {
    return Response.json(
      await beginChunkedUpload({
        ownerId: session.user.id,
        name: body.name,
        mimeType: body.mimeType || "application/octet-stream",
        size: body.size,
        projectId: body.projectId ?? null,
      })
    );
  } catch (error) {
    if (error instanceof UploadFileError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

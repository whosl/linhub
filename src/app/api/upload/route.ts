import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  persistUploadedAttachment,
  UploadFileError,
} from "@/lib/server/upload";

export const maxDuration = 120;

/** 聊天/项目附件上传：小文件兼容入口；大文件由分块路由规避边缘超时。 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const limited = rateLimit(`upload:${session.user.id}`, 30, 60_000);
  if (limited) return limited;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "缺少文件" }, { status: 400 });
  }
  const rawProjectId = form.get("projectId");
  const projectId =
    typeof rawProjectId === "string" && rawProjectId ? rawProjectId : null;

  try {
    const result = await persistUploadedAttachment({
      ownerId: session.user.id,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      projectId,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof UploadFileError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

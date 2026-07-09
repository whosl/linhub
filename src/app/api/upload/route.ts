import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { mediaPublicUrl, persistMedia } from "@/lib/server/media";
import {
  extOf,
  isAllowedUploadExt,
  isLegacyDoc,
} from "@/lib/file-types";
import {
  extractDocumentText,
  mimeFromImageExt,
  sniffImageExt,
} from "@/lib/server/document-extract";

export const maxDuration = 120;

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/** 聊天/项目附件上传：经 MediaService 私有存储，鉴权读取 */
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
  if (file.size > 20 * 1024 * 1024) {
    return Response.json({ error: "文件不能超过 20MB" }, { status: 400 });
  }
  const rawProjectId = form.get("projectId");
  const projectId =
    typeof rawProjectId === "string" && rawProjectId ? rawProjectId : null;
  if (projectId) {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.ownerId, session.user.id)
        )
      )
      .limit(1);
    if (!project) {
      return Response.json({ error: "项目不存在" }, { status: 404 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = `att-${uid()}`;
  const ext = extOf(file.name);

  if (isLegacyDoc(ext)) {
    return Response.json(
      { error: "不支持旧版 .doc，请另存为 .docx 后上传" },
      { status: 400 }
    );
  }

  const sniffedExt = sniffImageExt(buffer);
  const isImage = sniffedExt !== null;
  if (!isImage && !isAllowedUploadExt(ext)) {
    return Response.json(
      { error: `不支持的文件类型「${ext || "无扩展名"}」` },
      { status: 400 }
    );
  }
  const safeExt = isImage ? sniffedExt! : ext;

  let extractedText: string | null = null;
  if (!isImage) {
    try {
      const extracted = await extractDocumentText(
        file.name,
        file.type || "application/octet-stream",
        buffer,
        { context: "chat", userId: session.user.id }
      );
      extractedText = extracted.text || null;
    } catch (e) {
      return Response.json(
        {
          error: e instanceof Error ? e.message : "无法解析文件内容",
        },
        { status: 422 }
      );
    }
  }

  const asset = await persistMedia({
    id,
    ownerId: session.user.id,
    bytes: buffer,
    mimeType: isImage
      ? mimeFromImageExt(safeExt)
      : file.type || "application/octet-stream",
    name: file.name,
    kind: "upload",
    ext: safeExt,
    projectId,
    extractedText,
  });

  await db.insert(schema.attachments).values({
    id,
    ownerId: session.user.id,
    projectId,
    name: file.name,
    mimeType: asset.mimeType,
    size: file.size,
    storagePath: mediaPublicUrl(id),
    extractedText,
  });

  if (projectId) {
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
  }

  return Response.json({
    id,
    name: file.name,
    mimeType: asset.mimeType,
    size: file.size,
    url: isImage ? asset.url : undefined,
    mediaAssetId: id,
    hasText: !!extractedText,
    createdAt: asset.createdAt,
  });
}

import "server-only";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
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

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

export const MAX_ATTACHMENT_UPLOAD_BYTES = 20 * 1024 * 1024;

export class UploadFileError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export interface UploadEnvelope {
  ownerId: string;
  name: string;
  mimeType: string;
  size: number;
  projectId?: string | null;
}

export async function assertUploadEnvelope(input: UploadEnvelope) {
  if (!input.name.trim()) throw new UploadFileError(400, "文件名不能为空");
  if (input.size < 0 || input.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
    throw new UploadFileError(400, "文件不能超过 20MB");
  }
  if (isLegacyDoc(extOf(input.name))) {
    throw new UploadFileError(400, "不支持旧版 .doc，请另存为 .docx 后上传");
  }
  if (!input.projectId) return;

  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.ownerId, input.ownerId)
      )
    )
    .limit(1);
  if (!project) throw new UploadFileError(404, "项目不存在");
}

export async function persistUploadedAttachment(
  input: UploadEnvelope & { bytes: Buffer }
) {
  await assertUploadEnvelope({ ...input, size: input.bytes.length });

  const ext = extOf(input.name);
  const sniffedExt = sniffImageExt(input.bytes);
  const isImage = sniffedExt !== null;
  if (!isImage && !isAllowedUploadExt(ext)) {
    throw new UploadFileError(
      400,
      `不支持的文件类型「${ext || "无扩展名"}」`
    );
  }
  const safeExt = isImage ? sniffedExt! : ext;

  let extractedText: string | null = null;
  if (!isImage) {
    try {
      const extracted = await extractDocumentText(
        input.name,
        input.mimeType || "application/octet-stream",
        input.bytes,
        { context: "chat", userId: input.ownerId }
      );
      extractedText = extracted.text || null;
    } catch (error) {
      throw new UploadFileError(
        422,
        error instanceof Error ? error.message : "无法解析文件内容"
      );
    }
  }

  const id = `att-${uid()}`;
  const asset = await persistMedia({
    id,
    ownerId: input.ownerId,
    bytes: input.bytes,
    mimeType: isImage
      ? mimeFromImageExt(safeExt)
      : input.mimeType || "application/octet-stream",
    name: input.name,
    kind: "upload",
    ext: safeExt,
    projectId: input.projectId ?? null,
    extractedText,
  });

  await db.insert(schema.attachments).values({
    id,
    ownerId: input.ownerId,
    projectId: input.projectId ?? null,
    name: input.name,
    mimeType: asset.mimeType,
    size: input.bytes.length,
    storagePath: mediaPublicUrl(id),
    extractedText,
  });

  if (input.projectId) {
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, input.projectId));
  }

  return {
    id,
    name: input.name,
    mimeType: asset.mimeType,
    size: input.bytes.length,
    url: isImage ? asset.url : undefined,
    mediaAssetId: id,
    hasText: !!extractedText,
    createdAt: asset.createdAt,
  };
}

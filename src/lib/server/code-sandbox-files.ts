import "server-only";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { persistGeneratedAttachment } from "@/lib/server/generated-attachment";
import { openMediaStream } from "@/lib/server/media";
import { localAttachmentPath } from "@/lib/server/pptx";
import type { SandboxOutputFile } from "@/lib/server/code-sandbox";

export async function loadOwnedCodeSandboxInput(
  userId: string,
  attachmentId: string
) {
  const media = await openMediaStream(attachmentId, userId);
  if (media) return { name: media.row.name, buffer: media.buffer };

  const [attachment] = await db
    .select({
      name: schema.attachments.name,
      storagePath: schema.attachments.storagePath,
    })
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.id, attachmentId),
        eq(schema.attachments.ownerId, userId)
      )
    )
    .limit(1);
  if (!attachment) throw new Error("输入附件不存在或无权访问");

  if (attachment.storagePath.startsWith("/api/media/")) {
    const mediaId = attachment.storagePath.replace(/^\/api\/media\//u, "");
    const storedMedia = await openMediaStream(mediaId, userId);
    if (storedMedia) return { name: attachment.name, buffer: storedMedia.buffer };
  }
  const filePath = localAttachmentPath(attachment.storagePath);
  if (!filePath) throw new Error("输入附件文件不可读取");
  const { readFile } = await import("node:fs/promises");
  return { name: attachment.name, buffer: await readFile(filePath) };
}

export function codeSandboxInputName(value: string) {
  const name = value.replace(/\\/gu, "/").split("/").pop()?.trim() || "input.bin";
  return name.replace(/[\u0000\n\r,]/gu, "-").slice(0, 200) || "input.bin";
}

export async function persistCodeSandboxOutputs(
  ownerId: string,
  outputs: SandboxOutputFile[]
) {
  const attachments = [];
  for (const output of outputs) {
    const attachment = await persistGeneratedAttachment({
      ownerId,
      name: output.path,
      mimeType: codeSandboxOutputMimeType(output.path),
      bytes: output.data,
    });
    attachments.push({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.sizeBytes,
      sizeBytes: attachment.sizeBytes,
      url: attachment.url,
    });
  }
  return attachments;
}

export function codeSandboxOutputMimeType(name: string) {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const byExtension: Record<string, string> = {
    ".csv": "text/csv",
    ".html": "text/html",
    ".json": "application/json",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
  };
  return byExtension[extension] ?? "application/octet-stream";
}

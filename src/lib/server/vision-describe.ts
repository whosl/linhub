import "server-only";

import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { db, schema } from "@/lib/server/db";
import {
  modelResource,
  withAtomicBilling,
} from "@/lib/server/billing/capabilities";
import { resolveModel } from "@/lib/server/llm/registry";

const execFile = promisify(execFileCallback);
const VISION_INLINE_TARGET_BYTES = 1.5 * 1024 * 1024;
const VISION_INLINE_HARD_BYTES = 3 * 1024 * 1024;
const VISION_MAX_EDGE = 1800;
const VISION_JPEG_QUALITY = 72;

/**
 * 用管理员配置的辅助识图模型描述/OCR 图片。
 * 供 analyze_image 工具与知识库图片入库共用。
 */
export async function describeImageFromBuffer(
  userId: string,
  buffer: Buffer,
  mimeType: string,
  question = "请完整提取图片中的全部文字（OCR），并简要描述图片内容。若无文字则只描述画面。"
): Promise<string> {
  const [s] = await db
    .select({ helper: schema.settings.visionHelperModelId })
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"))
    .limit(1);
  if (!s?.helper) throw new Error("管理员尚未配置辅助识图模型");

  const { model, record } = await resolveModel(s.helper);
  const mime = mimeType.startsWith("image/") ? mimeType : "image/png";
  const image = await prepareVisionImage(buffer, mime);
  const base64 = image.buffer.toString("base64");

  const result = await withAtomicBilling(
    userId,
    {
      capability: "vision-helper",
      resource: modelResource(record),
      units: { inputTokens: 2000, outputTokens: 800 },
    },
    async () => {
      const { text } = await generateText({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                data: { type: "data", data: base64 },
                mediaType: image.mimeType,
              },
              { type: "text", text: question },
            ],
          },
        ],
      });
      return text;
    }
  );

  return (result ?? "").trim();
}

async function prepareVisionImage(buffer: Buffer, mimeType: string) {
  if (buffer.length <= VISION_INLINE_TARGET_BYTES) {
    return { buffer, mimeType };
  }

  const compressed = await compressImageWithSips(buffer, mimeType).catch(() => null);
  const candidate =
    compressed && compressed.buffer.length < buffer.length
      ? compressed
      : { buffer, mimeType };

  if (candidate.buffer.length > VISION_INLINE_HARD_BYTES) {
    throw new Error(
      "图片过大，辅助识图前压缩失败。请裁剪表格区域或上传更清晰的 Excel/CSV 原文件。"
    );
  }

  return candidate;
}

async function compressImageWithSips(buffer: Buffer, mimeType: string) {
  const inputExt = imageExtension(mimeType);
  const workdir = await mkdtemp(path.join(tmpdir(), "linhub-vision-"));
  const input = path.join(workdir, `input.${inputExt}`);
  const output = path.join(workdir, "output.jpg");

  try {
    await writeFile(input, buffer);
    await execFile(
      "/usr/bin/sips",
      [
        "--resampleHeightWidthMax",
        String(VISION_MAX_EDGE),
        "--setProperty",
        "format",
        "jpeg",
        "--setProperty",
        "formatOptions",
        String(VISION_JPEG_QUALITY),
        input,
        "--out",
        output,
      ],
      { timeout: 15_000, maxBuffer: 512 * 1024 }
    );
    const compressed = await readFile(output);
    return { buffer: Buffer.from(compressed), mimeType: "image/jpeg" };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

function imageExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/heic" || mimeType === "image/heif") return "heic";
  return "png";
}

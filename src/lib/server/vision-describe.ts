import "server-only";

import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { db, schema } from "@/lib/server/db";
import {
  modelResource,
  withAtomicBilling,
} from "@/lib/server/billing/capabilities";
import { resolveModel } from "@/lib/server/llm/registry";

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
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

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
              { type: "image", image: dataUrl },
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

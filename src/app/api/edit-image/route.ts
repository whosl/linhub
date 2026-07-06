import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { assertCanSpend, recordUsage } from "@/lib/server/billing";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  getImageModelConfig,
  saveGeneratedImage,
} from "@/lib/server/llm/tools";
import { isValidationResponse, parseBody } from "@/lib/server/validate";
import { formatUpstreamError } from "@/lib/server/upstream-error";

export const maxDuration = 60;

const ImageDataUrlSchema = z
  .string()
  .max(12_000_000, "图片过大")
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "图片格式无效");

const EditImageSchema = z.object({
  image: ImageDataUrlSchema,
  mask: ImageDataUrlSchema.nullable().optional(),
  prompt: z.string().trim().min(1, "请描述要怎么修改").max(2000, "描述过长"),
});

/** data:image/png;base64,xxx → ArrayBuffer（BlobPart 兼容） */
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const b64 = dataUrl.split(",")[1] ?? dataUrl;
  const buf = Buffer.from(b64, "base64");
  // 转成独立 ArrayBuffer 避免 SharedArrayBuffer 类型不兼容问题
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * 图片编辑（带 mask）。
 * 调上游 /images/edits（OpenAI 兼容 multipart）。
 * 用户不画 mask 时（mask 为空）→ 全图编辑。
 */
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  const userId = session.user.id;

  const limited = rateLimit(`edit-image:${userId}`, 10, 60_000);
  if (limited) return limited;

  const body = await parseBody(req, EditImageSchema);
  if (isValidationResponse(body)) return body;

  const { record, apiKey, baseURL } = await getImageModelConfig();
  // 编辑前按配置价格预检余额/额度
  await assertCanSpend(userId, Math.max(0, record.pricePerImage ?? 0));

  // 构造 multipart 请求（不能手动设 Content-Type，FormData 自动加 boundary）
  const form = new FormData();
  form.append("model", record.slug);
  form.append("prompt", body.prompt);
  form.append("n", "1");
  form.append("size", "1024x1024");
  form.append("image", new Blob([dataUrlToArrayBuffer(body.image)], { type: "image/png" }), "image.png");
  // mask：用户涂了才传，没涂 → 不传 → 全图编辑
  if (body.mask) {
    form.append("mask", new Blob([dataUrlToArrayBuffer(body.mask)], { type: "image/png" }), "mask.png");
  }

  const res = await fetch(`${baseURL}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    return Response.json(
      { error: await formatUpstreamError(res, "图片编辑失败") },
      { status: 502 }
    );
  }

  const data = (await res.json()) as { data: { b64_json?: string; url?: string }[] };
  const item = data.data?.[0];
  if (!item) return Response.json({ error: "编辑失败：未返回图片" }, { status: 502 });

  // 落盘（b64_json 是主要返回格式；url 兜底）
  let url = item.url ?? "";
  if (item.b64_json) {
    url = await saveGeneratedImage(userId, item.b64_json);
  }
  if (!url) return Response.json({ error: "编辑失败：未拿到图片 URL" }, { status: 502 });

  // 计费（同 generate_image）
  await recordUsage(userId, record, null, {
    inputTokens: 0,
    outputTokens: 0,
    imageCount: 1,
    costCents: Math.max(0, record.pricePerImage ?? 0),
  });

  return Response.json({ url });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  BillingError,
  assertModelAccess,
  recordReservedUsage,
  refundSpendReservation,
  reserveSpend,
  type SpendReservation,
} from "@/lib/server/billing";
import { rateLimit } from "@/lib/server/rate-limit";
import { saveGeneratedImage } from "@/lib/server/llm/tools";
import { getImageGenConfig } from "@/lib/server/engine-config";
import { isValidationResponse, parseBody } from "@/lib/server/validate";
import { formatUpstreamError } from "@/lib/server/upstream-error";
import { assertSafeUrl } from "@/lib/server/net-guard";

// 编辑请求 110s + 下载结果重试 30s×2 = 170s 最坏；留余量设 300s（5min）。
export const maxDuration = 300;

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

const REMOTE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const IMAGE_EDIT_TIMEOUT_MS = 110_000;
const MAX_REMOTE_IMAGE_REDIRECTS = 5;

function imageExtensionFromContentType(contentType: string | null): string | null {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  if (type === "image/png") return ".png";
  if (type === "image/jpeg" || type === "image/jpg") return ".jpg";
  if (type === "image/webp") return ".webp";
  return null;
}

async function saveRemoteGeneratedImage(userId: string, remoteUrl: string): Promise<string> {
  let ext = "";
  let buffer: Buffer | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchSafeRemoteImage(remoteUrl);
      if (!res.ok) throw new Error(await formatUpstreamError(res, "下载编辑结果失败"));
      const nextExt = imageExtensionFromContentType(res.headers.get("content-type"));
      if (!nextExt) throw new Error("编辑结果图片格式不受支持");
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > REMOTE_IMAGE_MAX_BYTES) throw new Error("编辑结果图片过大");
      const nextBuffer = Buffer.from(await res.arrayBuffer());
      if (nextBuffer.byteLength > REMOTE_IMAGE_MAX_BYTES) throw new Error("编辑结果图片过大");
      ext = nextExt;
      buffer = nextBuffer;
      break;
    } catch (e) {
      if (attempt === 0 && isTimeoutError(e)) continue;
      if (isTimeoutError(e)) throw new Error("下载编辑结果超时，请稍后重试");
      throw e;
    }
  }
  if (!buffer || !ext) throw new Error("下载编辑结果失败");

  const { mkdir, writeFile } = await import("node:fs/promises");
  const dir = `${process.cwd()}/public/generated`;
  await mkdir(dir, { recursive: true });
  const name = `${userId.slice(0, 6)}-${Date.now()}-${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)}${ext}`;
  await writeFile(`${dir}/${name}`, buffer);
  return `/generated/${name}`;
}

async function fetchSafeRemoteImage(rawUrl: string): Promise<Response> {
  let url = rawUrl;
  for (let redirects = 0; redirects <= MAX_REMOTE_IMAGE_REDIRECTS; redirects++) {
    await assertSafeUrl(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS),
      });
    } catch (e) {
      if (isTimeoutError(e)) throw new Error("下载编辑结果超时，请稍后重试");
      throw e;
    }
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;

    const location = res.headers.get("location");
    if (!location) throw new Error("下载编辑结果失败：重定向缺少 Location");
    url = new URL(location, url).toString();
  }
  throw new Error("下载编辑结果失败：重定向次数过多");
}

async function fetchImageEdit(baseURL: string, apiKey: string, form: FormData) {
  try {
    return await fetch(`${baseURL}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(IMAGE_EDIT_TIMEOUT_MS),
    });
  } catch (e) {
    if (isTimeoutError(e)) throw new Error("图片编辑超时，请稍后重试");
    throw e;
  }
}

function isTimeoutError(e: unknown) {
  if (typeof e === "string") return /timeout|aborted/i.test(e);
  if (!e || typeof e !== "object") return false;
  const maybeError = e as { name?: unknown; message?: unknown };
  const name = typeof maybeError.name === "string" ? maybeError.name : "";
  const message = typeof maybeError.message === "string" ? maybeError.message : "";
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    /timeout|aborted/i.test(message)
  );
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

  try {
    const imgConfig = await getImageGenConfig();
    const { apiKey, baseURL, model, record } = imgConfig;
    if (record) await assertModelAccess(userId, record);
    const pricePerImage = Math.max(0, record?.pricePerImage ?? 30);
    let reservation: SpendReservation | null = null;
    if (record && pricePerImage > 0) {
      reservation = await reserveSpend(
        userId,
        pricePerImage,
        `${record.displayName} 图片编辑消费`
      );
    }

    try {
      // 构造 multipart 请求（不能手动设 Content-Type，FormData 自动加 boundary）
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", body.prompt);
      form.append("n", "1");
      form.append("size", "1024x1024");
      form.append("image", new Blob([dataUrlToArrayBuffer(body.image)], { type: "image/png" }), "image.png");
      // mask：用户涂了才传，没涂 → 不传 → 全图编辑
      if (body.mask) {
        form.append("mask", new Blob([dataUrlToArrayBuffer(body.mask)], { type: "image/png" }), "mask.png");
      }

      const res = await fetchImageEdit(baseURL, apiKey, form);

      if (!res.ok) {
        throw new Error(await formatUpstreamError(res, "图片编辑失败"));
      }

      const text = await res.text();
      if (!text.trim()) {
        throw new Error("图片编辑失败：上游返回空响应");
      }
      let data: { data?: { b64_json?: string; url?: string }[] };
      try {
        data = JSON.parse(text) as { data?: { b64_json?: string; url?: string }[] };
      } catch {
        throw new Error("图片编辑失败：上游返回了非 JSON 响应");
      }
      const item = data.data?.[0];
      if (!item) throw new Error("编辑失败：未返回图片");

      // 落盘：无论上游返回 b64_json 还是临时 URL，统一保存为本站 /generated 路径。
      let url = "";
      if (item.b64_json) {
        url = await saveGeneratedImage(userId, item.b64_json);
      } else if (item.url) {
        url = await saveRemoteGeneratedImage(userId, item.url);
      }
      if (!url) throw new Error("编辑失败：未拿到图片 URL");

      // 计费（同 generate_image）
      if (record) {
        await recordReservedUsage(userId, record, null, {
          inputTokens: 0,
          outputTokens: 0,
          imageCount: 1,
          costCents: pricePerImage,
        });
      }

      return Response.json({ url });
    } catch (e) {
      if (reservation) {
        await refundSpendReservation(
          userId,
          reservation,
          `${record?.displayName ?? "图片编辑"} 失败退款`
        ).catch((err) =>
          console.error("[billing] 图片编辑失败退款异常", err)
        );
      }
      throw e;
    }
  } catch (e) {
    return Response.json(
      { error: toEditImageErrorMessage(e) },
      { status: e instanceof BillingError ? 402 : 502 }
    );
  }
}

function toEditImageErrorMessage(e: unknown) {
  if (e instanceof BillingError) return e.message;
  if (isTimeoutError(e)) return "图片编辑超时，请稍后重试";
  return e instanceof Error ? e.message : "图片编辑失败";
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { BillingError, assertModelAccess } from "@/lib/server/billing";
import {
  modelResource,
  withAtomicBilling,
} from "@/lib/server/billing/capabilities";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  saveGeneratedImage,
  saveRemoteGeneratedImage,
} from "@/lib/server/llm/tools";
import { deleteMedia, getOwnedMedia, mediaPublicUrl } from "@/lib/server/media";
import {
  imageEditAssetId,
  normalizeImageEditOperationKey,
  runImageEditSingleFlight,
} from "@/lib/server/image-edit-idempotency";
import { getImageGenConfig } from "@/lib/server/engine-config";
import { isValidationResponse, parseBody } from "@/lib/server/validate";
import { formatUpstreamError } from "@/lib/server/upstream-error";

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

const IMAGE_EDIT_TIMEOUT_MS = 110_000;

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
export async function GET(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  const operationKey = normalizeImageEditOperationKey(
    req.headers.get("Idempotency-Key")
  );
  if (!operationKey) {
    return Response.json({ error: "缺少有效的图片编辑操作键" }, { status: 400 });
  }
  const assetId = imageEditAssetId(session.user.id, operationKey);
  const existing = await getOwnedMedia(assetId, session.user.id);
  if (!existing) return Response.json({ error: "编辑结果不存在" }, { status: 404 });
  return Response.json({ url: mediaPublicUrl(existing.id), replayed: true });
}

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  const userId = session.user.id;
  const operationKey = normalizeImageEditOperationKey(
    req.headers.get("Idempotency-Key")
  );
  if (!operationKey) {
    return Response.json({ error: "缺少有效的图片编辑操作键" }, { status: 400 });
  }
  const operationId = imageEditAssetId(userId, operationKey);
  const replay = await getOwnedMedia(operationId, userId);
  if (replay) {
    return Response.json({ url: mediaPublicUrl(replay.id), replayed: true });
  }

  const limited = rateLimit(`edit-image:${userId}`, 10, 60_000);
  if (limited) return limited;

  const body = await parseBody(req, EditImageSchema);
  if (isValidationResponse(body)) return body;

  try {
    const result = await runImageEditSingleFlight(operationId, async () => {
      const existing = await getOwnedMedia(operationId, userId);
      if (existing) return { url: mediaPublicUrl(existing.id), replayed: true };

      const imgConfig = await getImageGenConfig();
      const { apiKey, baseURL, model, record } = imgConfig;
      if (record) await assertModelAccess(userId, record);
      const pricePerImage = Math.max(0, record?.pricePerImage ?? 30);
      let createdAsset = false;

      const runEdit = async () => {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", body.prompt);
        form.append("n", "1");
        form.append("size", "1024x1024");
        form.append(
          "image",
          new Blob([dataUrlToArrayBuffer(body.image)], { type: "image/png" }),
          "image.png"
        );
        if (body.mask) {
          form.append(
            "mask",
            new Blob([dataUrlToArrayBuffer(body.mask)], { type: "image/png" }),
            "mask.png"
          );
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

        let url = "";
        if (item.b64_json) {
          url = await saveGeneratedImage(userId, item.b64_json, "edited", operationId);
        } else if (item.url) {
          url = await saveRemoteGeneratedImage(
            userId,
            item.url,
            "edited",
            operationId
          );
        }
        if (!url) throw new Error("编辑失败：未拿到图片 URL");
        createdAsset = true;
        return { url };
      };

      try {
        if (record && pricePerImage > 0) {
          return await withAtomicBilling(
            userId,
            {
              capability: "image-edit",
              resource: modelResource(record),
              units: { imageCount: 1 },
              costCents: pricePerImage,
            },
            runEdit
          );
        }
        return await runEdit();
      } catch (error) {
        if (createdAsset) await deleteMedia(operationId, userId).catch(() => undefined);
        throw error;
      }
    });
    return Response.json(result);
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

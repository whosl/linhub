import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { assertSafeUrl } from "@/lib/server/net-guard";
import { db, schema } from "@/lib/server/db";

const LOCAL_IMAGE_INLINE_MAX_BYTES = 8 * 1024 * 1024;
const DATA_URL_MAX_LENGTH = Math.ceil((LOCAL_IMAGE_INLINE_MAX_BYTES * 4) / 3) + 128;

function mimeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  // 避免对超大 base64 用正则回溯；用 indexOf 切片
  if (!dataUrl.startsWith("data:") || !dataUrl.includes(";base64,")) {
    throw new Error("无法解析图片 data URL");
  }
  const comma = dataUrl.indexOf(";base64,");
  const mimeType = dataUrl.slice(5, comma) || "image/png";
  const b64 = dataUrl.slice(comma + 8);
  return { mimeType, buffer: Buffer.from(b64, "base64") };
}

/**
 * 读取本站/远程图片为 Buffer，供辅助识图等路径使用。
 * 本地媒体直接读盘，避免先转成数 MB 的 data URL 再正则解析。
 */
export async function resolveImageBuffer(
  url: string,
  origin = process.env.APP_ORIGIN ?? "http://localhost:3000"
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (url.startsWith("data:image/")) {
    if (url.length > DATA_URL_MAX_LENGTH) {
      throw new Error("图片过大，请压缩到 8MB 以下再发送");
    }
    return parseDataUrl(url);
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    await assertSafeUrl(url);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`下载图片失败（${res.status}）`);
    const ct = res.headers.get("content-type");
    const mimeType = ct?.startsWith("image/")
      ? ct.split(";")[0]!.trim()
      : "image/png";
    return { buffer: Buffer.from(await res.arrayBuffer()), mimeType };
  }

  if (!url.startsWith("/")) throw new Error("图片路径无效");
  if (url.includes("..") || url.includes("\\")) {
    throw new Error("图片路径无效");
  }

  const mediaMatch = url.match(/^\/api\/media\/([^/?#]+)/);
  if (mediaMatch) {
    const [row] = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, mediaMatch[1]))
      .limit(1);
    if (!row) throw new Error("图片不存在");
    const filePath = path.join(process.cwd(), row.storageKey);
    const info = await stat(filePath).catch(() => null);
    if (!info) throw new Error("图片文件缺失");
    if (info.size > LOCAL_IMAGE_INLINE_MAX_BYTES) {
      throw new Error("图片过大，请压缩到 8MB 以下再发送");
    }
    return {
      buffer: await readFile(filePath),
      mimeType: row.mimeType || "image/png",
    };
  }

  if (url.startsWith("/uploads/") || url.startsWith("/generated/")) {
    const cleanPath = url.split(/[?#]/, 1)[0].slice(1);
    const filePath = `${process.cwd()}/public/${cleanPath}`;
    const info = await stat(filePath).catch(() => null);
    if (!info) throw new Error("图片不存在");
    if (info.size > LOCAL_IMAGE_INLINE_MAX_BYTES) {
      throw new Error("图片过大，请压缩到 8MB 以下再发送");
    }
    return {
      buffer: await readFile(filePath),
      mimeType: mimeFromPath(cleanPath),
    };
  }

  throw new Error(`不支持的图片路径（origin=${origin}）`);
}

/**
 * 把本站媒体转为 data URL，避免远端模型/网关去下载 localhost。
 * 支持：/api/media/{id}、遗留 /uploads|/generated、data:、http(s)。
 */
export async function resolveImageSource(
  url: string,
  origin = process.env.APP_ORIGIN ?? "http://localhost:3000"
): Promise<string> {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    await assertSafeUrl(url);
    return url;
  }
  if (url.startsWith("data:image/")) {
    if (url.length > DATA_URL_MAX_LENGTH) {
      throw new Error("图片过大，请压缩到 8MB 以下再发送");
    }
    return url;
  }

  const { buffer, mimeType } = await resolveImageBuffer(url, origin);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

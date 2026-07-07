import { readFile, stat } from "node:fs/promises";
import { assertSafeUrl } from "@/lib/server/net-guard";

const LOCAL_IMAGE_PREFIXES = ["/uploads/", "/generated/"];
const LOCAL_IMAGE_INLINE_MAX_BYTES = 8 * 1024 * 1024;
const DATA_URL_MAX_LENGTH = Math.ceil((LOCAL_IMAGE_INLINE_MAX_BYTES * 4) / 3) + 128;

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

function assertLocalImagePath(url: string) {
  if (!LOCAL_IMAGE_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    throw new Error("仅支持本站上传或生成的图片路径");
  }
  if (url.includes("..") || url.includes("\\")) {
    throw new Error("图片路径无效");
  }
}

/**
 * 把本站本地图片路径转成 data URL，避免远端模型/网关去下载 localhost。
 * 远程 http(s) URL 保持原样，由调用方负责 SSRF 校验。
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
  if (!url.startsWith("/")) throw new Error("图片路径无效");

  assertLocalImagePath(url);
  const cleanPath = url.split(/[?#]/, 1)[0].slice(1);
  const filePath = `${process.cwd()}/public/${cleanPath}`;
  const info = await stat(filePath).catch(() => null);
  if (!info) return `${origin}${url}`;
  if (info.size > LOCAL_IMAGE_INLINE_MAX_BYTES) {
    throw new Error("图片过大，请压缩到 8MB 以下再发送");
  }
  try {
    const buf = await readFile(filePath);
    return `data:${mimeFromPath(cleanPath)};base64,${buf.toString("base64")}`;
  } catch {
    return `${origin}${url}`;
  }
}

import { readFile } from "node:fs/promises";

const LOCAL_IMAGE_PREFIXES = ["/uploads/", "/generated/"];

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
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:image/")) return url;
  if (!url.startsWith("/")) throw new Error("图片路径无效");

  assertLocalImagePath(url);
  const cleanPath = url.split(/[?#]/, 1)[0].slice(1);
  try {
    const buf = await readFile(`${process.cwd()}/public/${cleanPath}`);
    return `data:${mimeFromPath(cleanPath)};base64,${buf.toString("base64")}`;
  } catch {
    return `${origin}${url}`;
  }
}

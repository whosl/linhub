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
    const buf = await readFile(filePath);
    return `data:${row.mimeType};base64,${buf.toString("base64")}`;
  }

  // 遗留 public 路径（迁移期兼容）
  if (url.startsWith("/uploads/") || url.startsWith("/generated/")) {
    const cleanPath = url.split(/[?#]/, 1)[0].slice(1);
    const filePath = `${process.cwd()}/public/${cleanPath}`;
    const info = await stat(filePath).catch(() => null);
    if (!info) throw new Error("图片不存在");
    if (info.size > LOCAL_IMAGE_INLINE_MAX_BYTES) {
      throw new Error("图片过大，请压缩到 8MB 以下再发送");
    }
    const buf = await readFile(filePath);
    return `data:${mimeFromPath(cleanPath)};base64,${buf.toString("base64")}`;
  }

  throw new Error(`不支持的图片路径（origin=${origin}）`);
}

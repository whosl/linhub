import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

export type MediaKind = "upload" | "generated" | "edited";

export interface PersistMediaInput {
  ownerId: string;
  bytes: Buffer;
  mimeType: string;
  name: string;
  kind: MediaKind;
  ext?: string;
  conversationId?: string | null;
  messageId?: string | null;
  projectId?: string | null;
  sourceTool?: string | null;
  extractedText?: string | null;
  /** 若提供则使用该 id（用于与 attachments 对齐） */
  id?: string;
}

export interface MediaAssetDto {
  id: string;
  ownerId: string;
  kind: MediaKind;
  name: string;
  mimeType: string;
  size: number;
  /** 鉴权访问 URL */
  url: string;
  conversationId?: string;
  messageId?: string;
  projectId?: string;
  sourceTool?: string;
  /** 是否存在可按需读取的服务端提取文本；列表接口不携带正文。 */
  extractedTextAvailable: boolean;
  extractedText?: string;
  createdAt: string;
}

function mediaRoot() {
  return path.join(process.cwd(), "data", "media");
}

function extFromMime(mime: string, fallback = ".bin") {
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  return fallback;
}

function absolutePath(storageKey: string) {
  if (storageKey.includes("..") || storageKey.includes("\\") || path.isAbsolute(storageKey)) {
    throw new Error("非法存储路径");
  }
  return path.join(process.cwd(), storageKey);
}

export function mediaPublicUrl(assetId: string) {
  return `/api/media/${assetId}`;
}

export function toMediaDto(
  row: typeof schema.mediaAssets.$inferSelect
): MediaAssetDto {
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: row.kind,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    url: mediaPublicUrl(row.id),
    conversationId: row.conversationId ?? undefined,
    messageId: row.messageId ?? undefined,
    projectId: row.projectId ?? undefined,
    sourceTool: row.sourceTool ?? undefined,
    extractedTextAvailable: row.extractedText !== null,
    extractedText: row.extractedText ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 写入私有存储并落库 */
export async function persistMedia(
  input: PersistMediaInput
): Promise<MediaAssetDto> {
  const id = input.id ?? `med-${uid()}`;
  const ext =
    input.ext ??
    (path.extname(input.name) || extFromMime(input.mimeType));
  const safeExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  const storageKey = path.join(
    "data",
    "media",
    input.ownerId,
    `${id}${safeExt}`
  );
  const abs = absolutePath(storageKey);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, input.bytes);

  await db.insert(schema.mediaAssets).values({
    id,
    ownerId: input.ownerId,
    kind: input.kind,
    name: input.name,
    mimeType: input.mimeType,
    size: input.bytes.length,
    storageKey,
    conversationId: input.conversationId ?? null,
    messageId: input.messageId ?? null,
    projectId: input.projectId ?? null,
    sourceTool: input.sourceTool ?? null,
    extractedText: input.extractedText ?? null,
  });

  const [row] = await db
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.id, id))
    .limit(1);
  return toMediaDto(row!);
}

export async function getOwnedMedia(assetId: string, viewerId: string) {
  const [row] = await db
    .select()
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.id, assetId),
        eq(schema.mediaAssets.ownerId, viewerId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function openMediaStream(assetId: string, viewerId: string) {
  const row = await getOwnedMedia(assetId, viewerId);
  if (!row) return null;
  const buf = await readFile(absolutePath(row.storageKey));
  return { row, buffer: buf };
}

export async function listMedia(
  ownerId: string,
  opts: {
    kind?: MediaKind | MediaKind[];
    q?: string;
    limit?: number;
    cursor?: string;
  } = {}
) {
  const limit = Math.min(opts.limit ?? 60, 100);
  const kinds = opts.kind
    ? Array.isArray(opts.kind)
      ? opts.kind
      : [opts.kind]
    : null;

  const conditions = [eq(schema.mediaAssets.ownerId, ownerId)];
  if (kinds?.length) {
    conditions.push(inArray(schema.mediaAssets.kind, kinds));
  }
  if (opts.cursor) {
    const cursorDate = new Date(opts.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(schema.mediaAssets.createdAt, cursorDate));
    }
  }
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    conditions.push(sql`${schema.mediaAssets.name} ILIKE ${q}`);
  }

  // 文件列表只读取卡片需要的轻量字段。Office/PDF 的提取正文可能达到
  // 100k 字符；若每页 60 项全部下发，会拖慢 Web/Android 首屏并放大 Room 缓存。
  const rows = await db
    .select({
      id: schema.mediaAssets.id,
      ownerId: schema.mediaAssets.ownerId,
      kind: schema.mediaAssets.kind,
      name: schema.mediaAssets.name,
      mimeType: schema.mediaAssets.mimeType,
      size: schema.mediaAssets.size,
      conversationId: schema.mediaAssets.conversationId,
      messageId: schema.mediaAssets.messageId,
      projectId: schema.mediaAssets.projectId,
      sourceTool: schema.mediaAssets.sourceTool,
      extractedTextAvailable: sql<boolean>`${schema.mediaAssets.extractedText} is not null`,
      createdAt: schema.mediaAssets.createdAt,
    })
    .from(schema.mediaAssets)
    .where(and(...conditions))
    .orderBy(desc(schema.mediaAssets.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map((row) => ({
      id: row.id,
      ownerId: row.ownerId,
      kind: row.kind,
      name: row.name,
      mimeType: row.mimeType,
      size: row.size,
      url: mediaPublicUrl(row.id),
      conversationId: row.conversationId ?? undefined,
      messageId: row.messageId ?? undefined,
      projectId: row.projectId ?? undefined,
      sourceTool: row.sourceTool ?? undefined,
      extractedTextAvailable: row.extractedTextAvailable,
      createdAt: row.createdAt.toISOString(),
    } satisfies MediaAssetDto)),
    nextCursor: hasMore
      ? page[page.length - 1]?.createdAt.toISOString()
      : undefined,
  };
}

export async function deleteMedia(assetId: string, ownerId: string) {
  const row = await getOwnedMedia(assetId, ownerId);
  if (!row) return false;
  await db.delete(schema.mediaAssets).where(eq(schema.mediaAssets.id, assetId));
  await unlink(absolutePath(row.storageKey)).catch(() => undefined);
  // 同步删除旧 attachments 行（若 id 相同）
  await db
    .delete(schema.attachments)
    .where(
      and(
        eq(schema.attachments.id, assetId),
        eq(schema.attachments.ownerId, ownerId)
      )
    )
    .catch(() => undefined);
  return true;
}

/** 短时签名 URL，供 <img> 在 cookie 不便时使用（可选） */
export function signMediaUrl(assetId: string, userId: string, ttlSec = 3600) {
  const secret = process.env.BETTER_AUTH_SECRET ?? "linhub";
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${assetId}.${userId}.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `/api/media/${assetId}?exp=${exp}&uid=${encodeURIComponent(userId)}&sig=${sig}`;
}

export function verifyMediaSignature(
  assetId: string,
  userId: string,
  exp: string,
  sig: string
) {
  const expNum = Number(exp);
  if (!expNum || expNum * 1000 < Date.now()) return false;
  const secret = process.env.BETTER_AUTH_SECRET ?? "linhub";
  const payload = `${assetId}.${userId}.${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

/** 从旧 public 路径或 data 路径导入到 media_assets（backfill） */
export async function importLegacyFile(opts: {
  ownerId: string;
  absoluteOrRelativePath: string;
  name: string;
  mimeType: string;
  kind: MediaKind;
  id?: string;
  projectId?: string | null;
  conversationId?: string | null;
}): Promise<MediaAssetDto | null> {
  const abs = path.isAbsolute(opts.absoluteOrRelativePath)
    ? opts.absoluteOrRelativePath
    : path.join(process.cwd(), opts.absoluteOrRelativePath);
  const bytes = await readFile(abs).catch(() => null);
  if (!bytes) return null;
  return persistMedia({
    id: opts.id,
    ownerId: opts.ownerId,
    bytes,
    mimeType: opts.mimeType,
    name: opts.name,
    kind: opts.kind,
    projectId: opts.projectId,
    conversationId: opts.conversationId,
  });
}

export { mediaRoot };

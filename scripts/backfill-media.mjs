/**
 * 将遗留 attachments /uploads|/generated 文件回填到 media_assets。
 *
 * 用法：
 *   node scripts/backfill-media.mjs
 *   DATABASE_URL=postgres://... node scripts/backfill-media.mjs
 *
 * 依赖：postgres（项目已安装）。
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://linhub:linhub_dev_password@localhost:5433/linhub";

const ROOT = process.cwd();
const sql = postgres(DATABASE_URL, { max: 1 });

function uid() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

function extFromName(name, mime) {
  const fromName = path.extname(name);
  if (fromName) return fromName.toLowerCase();
  if (mime?.includes("png")) return ".png";
  if (mime?.includes("jpeg") || mime?.includes("jpg")) return ".jpg";
  if (mime?.includes("webp")) return ".webp";
  if (mime?.includes("gif")) return ".gif";
  if (mime?.includes("pdf")) return ".pdf";
  return ".bin";
}

function resolveLegacyPath(storagePathOrUrl) {
  if (!storagePathOrUrl) return null;
  const s = storagePathOrUrl;
  if (s.startsWith("data/media/")) {
    return path.join(ROOT, s);
  }
  if (s.startsWith("data/uploads/")) {
    return path.join(ROOT, s);
  }
  if (s.startsWith("/uploads/")) {
    const name = path.basename(s);
    const candidates = [
      path.join(ROOT, "data", "uploads", name),
      path.join(ROOT, "public", "uploads", name),
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }
  if (s.startsWith("/generated/")) {
    const name = path.basename(s);
    const candidates = [
      path.join(ROOT, "public", "generated", name),
      path.join(ROOT, "data", "generated", name),
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }
  if (!path.isAbsolute(s) && !s.includes("..")) {
    const abs = path.join(ROOT, s);
    if (existsSync(abs)) return abs;
  }
  return null;
}

async function mediaExists(id) {
  const rows = await sql`select id from media_assets where id = ${id} limit 1`;
  return rows.length > 0;
}

async function insertMedia({
  id,
  ownerId,
  kind,
  name,
  mimeType,
  size,
  storageKey,
  conversationId,
  messageId,
  projectId,
  sourceTool,
  extractedText,
}) {
  await sql`
    insert into media_assets (
      id, owner_id, kind, name, mime_type, size, storage_key,
      conversation_id, message_id, project_id, source_tool, extracted_text
    ) values (
      ${id}, ${ownerId}, ${kind}, ${name}, ${mimeType}, ${size}, ${storageKey},
      ${conversationId ?? null}, ${messageId ?? null}, ${projectId ?? null},
      ${sourceTool ?? null}, ${extractedText ?? null}
    )
    on conflict (id) do nothing
  `;
}

async function copyIntoMediaStore(ownerId, id, srcPath, ext) {
  const storageKey = path.join("data", "media", ownerId, `${id}${ext}`);
  const abs = path.join(ROOT, storageKey);
  await mkdir(path.dirname(abs), { recursive: true });
  if (!existsSync(abs)) {
    await copyFile(srcPath, abs);
  }
  const st = await stat(abs);
  return { storageKey, size: st.size };
}

async function backfillAttachments() {
  const rows = await sql`
    select id, owner_id, project_id, name, mime_type, size, storage_path, extracted_text, created_at
    from attachments
  `;
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    if (await mediaExists(row.id)) {
      skipped += 1;
      continue;
    }
    // 已是 media URL 的跳过物理拷贝，但仍可建行（若文件已在 media）
    const src = resolveLegacyPath(row.storage_path);
    if (!src) {
      console.warn(`[skip attachment] 找不到文件: ${row.id} ${row.storage_path}`);
      skipped += 1;
      continue;
    }
    const ext = extFromName(row.name, row.mime_type);
    const { storageKey, size } = await copyIntoMediaStore(
      row.owner_id,
      row.id,
      src,
      ext
    );
    await insertMedia({
      id: row.id,
      ownerId: row.owner_id,
      kind: "upload",
      name: row.name,
      mimeType: row.mime_type,
      size: size || row.size || 0,
      storageKey,
      projectId: row.project_id,
      extractedText: row.extracted_text,
    });
    imported += 1;
  }
  console.log(`attachments → media_assets: imported=${imported} skipped=${skipped}`);
}

function collectUrlsFromParts(parts, out) {
  if (!Array.isArray(parts)) return;
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if (typeof part.url === "string") out.push(part.url);
    if (typeof part.image === "string") out.push(part.image);
    if (Array.isArray(part.content)) collectUrlsFromParts(part.content, out);
  }
}

async function backfillMessageUrls() {
  const rows = await sql`
    select m.id as message_id, m.conversation_id, m.parts, c.owner_id
    from messages m
    inner join conversations c on c.id = m.conversation_id
  `;
  let imported = 0;
  let skipped = 0;
  const seen = new Set();

  for (const row of rows) {
    const urls = [];
    collectUrlsFromParts(row.parts, urls);
    for (const url of urls) {
      if (!url.startsWith("/uploads/") && !url.startsWith("/generated/")) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      const src = resolveLegacyPath(url);
      if (!src) {
        console.warn(`[skip message url] 找不到文件: ${url}`);
        skipped += 1;
        continue;
      }

      const basename = path.basename(url);
      const id = `med-${uid()}`;
      // 若同名已存在则跳过（按 storage 文件名粗略去重）
      const existing = await sql`
        select id from media_assets
        where owner_id = ${row.owner_id}
          and storage_key like ${`%/${basename}`}
        limit 1
      `;
      if (existing.length > 0) {
        skipped += 1;
        continue;
      }

      const kind = url.startsWith("/generated/") ? "generated" : "upload";
      const ext = path.extname(basename) || ".bin";
      const mimeType =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : "application/octet-stream";

      const { storageKey, size } = await copyIntoMediaStore(
        row.owner_id,
        id,
        src,
        ext
      );
      await insertMedia({
        id,
        ownerId: row.owner_id,
        kind,
        name: basename,
        mimeType,
        size,
        storageKey,
        conversationId: row.conversation_id,
        messageId: row.message_id,
        sourceTool: kind === "generated" ? "backfill" : null,
      });
      imported += 1;
    }
  }
  console.log(`message urls → media_assets: imported=${imported} skipped=${skipped}`);
}

async function main() {
  console.log("backfill-media: start");
  await backfillAttachments();
  await backfillMessageUrls();
  console.log("backfill-media: done");
  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error(e);
  await sql.end({ timeout: 5 }).catch(() => undefined);
  process.exit(1);
});

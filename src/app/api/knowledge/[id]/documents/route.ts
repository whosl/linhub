import { NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  extOf,
  isAllowedUploadExt,
  isLegacyDoc,
} from "@/lib/file-types";
import {
  extractDocumentText,
  mimeFromImageExt,
  sniffImageExt,
} from "@/lib/server/document-extract";

export const maxDuration = 300;

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

async function requireOwnedKb(kbId: string, userId: string) {
  const [kb] = await db
    .select({ id: schema.knowledgeBases.id })
    .from(schema.knowledgeBases)
    .where(
      and(
        eq(schema.knowledgeBases.id, kbId),
        eq(schema.knowledgeBases.ownerId, userId)
      )
    );
  return kb ?? null;
}

function toUi(d: typeof schema.kbDocuments.$inferSelect) {
  return {
    id: d.id,
    knowledgeBaseId: d.knowledgeBaseId,
    name: d.name,
    mimeType: d.mimeType,
    size: d.size,
    status: d.status,
    chunkCount: d.chunkCount,
    extractMethod: d.extractMethod ?? undefined,
    errorMessage: d.errorMessage ?? undefined,
    createdAt: d.createdAt.toISOString(),
  };
}

function kbDocStorageKey(ownerId: string, docId: string, ext: string) {
  const safeExt = ext && ext.startsWith(".") ? ext : ".bin";
  return path.join("data", "kb-docs", ownerId, `${docId}${safeExt}`);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await requireOwnedKb(id, session.user.id))) {
    return Response.json({ error: "不存在" }, { status: 404 });
  }
  const rows = await db
    .select()
    .from(schema.kbDocuments)
    .where(eq(schema.kbDocuments.knowledgeBaseId, id))
    .orderBy(desc(schema.kbDocuments.createdAt));
  return Response.json(rows.map(toUi));
}

/** 上传文档：解析 → 分块 → embedding → 入库 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const { id: kbId } = await params;
  if (!(await requireOwnedKb(kbId, session.user.id))) {
    return Response.json({ error: "不存在" }, { status: 404 });
  }

  const limited = rateLimit(`kb-doc-upload:${session.user.id}`, 10, 60_000);
  if (limited) return limited;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return Response.json({ error: "缺少文件" }, { status: 400 });
  if (file.size > 30 * 1024 * 1024) {
    return Response.json({ error: "文件不能超过 30MB" }, { status: 400 });
  }

  const ext = extOf(file.name);
  if (isLegacyDoc(ext)) {
    return Response.json(
      { error: "不支持旧版 .doc，请另存为 .docx 后上传" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageExt(buffer);
  const isImage = sniffed !== null;
  if (!isImage && !isAllowedUploadExt(ext)) {
    return Response.json(
      { error: `不支持的文件类型「${ext || "无扩展名"}」` },
      { status: 400 }
    );
  }

  const mimeType = isImage
    ? mimeFromImageExt(sniffed!)
    : file.type || "application/octet-stream";
  const safeExt = isImage ? sniffed! : ext || ".bin";

  const docId = `doc-${uid()}`;
  const storagePath = kbDocStorageKey(session.user.id, docId, safeExt);
  const abs = path.join(process.cwd(), storagePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);

  await db.insert(schema.kbDocuments).values({
    id: docId,
    knowledgeBaseId: kbId,
    name: file.name,
    mimeType,
    size: file.size,
    status: "processing",
    storagePath,
  });

  try {
    const extracted = await extractDocumentText(file.name, mimeType, buffer, {
      context: "knowledge",
      userId: session.user.id,
    });
    if (!extracted.text?.trim()) throw new Error("无法从文件中提取文本");

    const { chunkText, embedTexts } = await import(
      "@/lib/server/llm/embedding"
    );
    const chunks = chunkText(extracted.text);
    if (chunks.length === 0) throw new Error("文档内容为空");

    const BATCH = 64;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      let embeddings: number[][] | null = null;
      try {
        const result = await embedTexts(batch, { userId: session.user.id });
        if (
          result.length === batch.length &&
          result.every((embedding) => embedding.length === 1536)
        ) {
          embeddings = result;
        }
      } catch (e) {
        console.warn("知识库 embedding 失败，已降级为关键词检索", e);
      }
      await db.insert(schema.kbChunks).values(
        batch.map((content, j) => ({
          id: `chk-${uid()}`,
          documentId: docId,
          knowledgeBaseId: kbId,
          chunkIndex: i + j,
          content,
          ...(embeddings?.[j] ? { embedding: embeddings[j] } : {}),
        }))
      );
    }

    await db
      .update(schema.kbDocuments)
      .set({
        status: "ready",
        chunkCount: chunks.length,
        extractMethod: extracted.method,
        errorMessage: null,
      })
      .where(eq(schema.kbDocuments.id, docId));
    await db
      .update(schema.knowledgeBases)
      .set({ updatedAt: new Date() })
      .where(eq(schema.knowledgeBases.id, kbId));
  } catch (e) {
    const message = e instanceof Error ? e.message : "处理失败";
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.kbChunks)
        .where(eq(schema.kbChunks.documentId, docId));
      await tx
        .update(schema.kbDocuments)
        .set({ status: "error", chunkCount: 0, errorMessage: message })
        .where(eq(schema.kbDocuments.id, docId));
    });
    const [doc] = await db
      .select()
      .from(schema.kbDocuments)
      .where(eq(schema.kbDocuments.id, docId));
    return Response.json({ ...toUi(doc), error: message }, { status: 422 });
  }

  const [doc] = await db
    .select()
    .from(schema.kbDocuments)
    .where(eq(schema.kbDocuments.id, docId));
  return Response.json(toUi(doc));
}

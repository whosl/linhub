import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";

export const maxDuration = 300;

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

async function requireOwnedKb(kbId: string, userId: string) {
  const [kb] = await db
    .select({ id: schema.knowledgeBases.id })
    .from(schema.knowledgeBases)
    .where(
      and(eq(schema.knowledgeBases.id, kbId), eq(schema.knowledgeBases.ownerId, userId))
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
    createdAt: d.createdAt.toISOString(),
  };
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

  // I3: 限频——文档上传触发昂贵的 PDF 解析 + 嵌入批，10 次/分/用户
  const limited = rateLimit(`kb-doc-upload:${session.user.id}`, 10, 60_000);
  if (limited) return limited;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "缺少文件" }, { status: 400 });
  if (file.size > 30 * 1024 * 1024) {
    return Response.json({ error: "文件不能超过 30MB" }, { status: 400 });
  }

  const docId = `doc-${uid()}`;
  await db.insert(schema.kbDocuments).values({
    id: docId,
    knowledgeBaseId: kbId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    status: "processing",
  });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractDocText(file.name, file.type, buffer);
    if (!text?.trim()) throw new Error("无法从文件中提取文本");

    const { chunkText, embedTexts } = await import("@/lib/server/llm/embedding");
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("文档内容为空");

    // 分批 embedding（每批 64）
    const BATCH = 64;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const embeddings = await embedTexts(batch);
      await db.insert(schema.kbChunks).values(
        batch.map((content, j) => ({
          id: `chk-${uid()}`,
          documentId: docId,
          knowledgeBaseId: kbId,
          chunkIndex: i + j,
          content,
          embedding: embeddings[j],
        }))
      );
    }

    await db
      .update(schema.kbDocuments)
      .set({ status: "ready", chunkCount: chunks.length })
      .where(eq(schema.kbDocuments.id, docId));
    await db
      .update(schema.knowledgeBases)
      .set({ updatedAt: new Date() })
      .where(eq(schema.knowledgeBases.id, kbId));
  } catch (e) {
    await db.transaction(async (tx) => {
      await tx.delete(schema.kbChunks).where(eq(schema.kbChunks.documentId, docId));
      await tx
        .update(schema.kbDocuments)
        .set({ status: "error", chunkCount: 0 })
        .where(eq(schema.kbDocuments.id, docId));
    });
    const [doc] = await db
      .select()
      .from(schema.kbDocuments)
      .where(eq(schema.kbDocuments.id, docId));
    // M6: 处理失败应用非 2xx 状态码，避免客户端误判为成功
    return Response.json(
      { ...toUi(doc), error: e instanceof Error ? e.message : "处理失败" },
      { status: 422 }
    );
  }

  const [doc] = await db
    .select()
    .from(schema.kbDocuments)
    .where(eq(schema.kbDocuments.id, docId));
  return Response.json(toUi(doc));
}

async function extractDocText(
  name: string,
  mimeType: string,
  buffer: Buffer
): Promise<string | null> {
  const lower = name.toLowerCase();
  if (
    mimeType.startsWith("text/") ||
    lower.endsWith(".md") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".json")
  ) {
    return buffer.toString("utf-8");
  }
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const data = await parser.getText();
    await parser.destroy();
    return data.text;
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return null;
}

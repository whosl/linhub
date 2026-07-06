import { NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";

export const maxDuration = 60;

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/** 允许的扩展名白名单（H3：防任意文件投放）。html/svg 故意排除，防存储型 XSS */
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const DOC_EXTS = new Set([
  ".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml",
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".go", ".rs", ".c", ".cpp",
  ".h", ".css", ".sql", ".sh", ".rb", ".php", ".log",
]);

/** 用文件头（magic bytes）验证图片真实类型，防伪造 MIME */
function sniffImage(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return ".png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (buffer.subarray(0, 6).toString("latin1") === "GIF87a") return ".gif";
  if (buffer.subarray(0, 6).toString("latin1") === "GIF89a") return ".gif";
  if (
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return ".webp";
  return null;
}

/** 聊天/项目附件上传：图片直接可访问，文档抽取文本供模型理解 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const limited = rateLimit(`upload:${session.user.id}`, 30, 60_000);
  if (limited) return limited;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "缺少文件" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return Response.json({ error: "文件不能超过 20MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = `att-${uid()}`;
  const ext = path.extname(file.name).toLowerCase();

  // 只有 magic bytes 验证通过的图片才进 public/（可直接访问）；
  // 其余文件必须在文档白名单内，落 data/（不可 Web 访问）
  const sniffedExt = IMAGE_EXTS.has(ext) ? sniffImage(buffer) : null;
  const isImage = sniffedExt !== null;
  if (!isImage && !DOC_EXTS.has(ext)) {
    return Response.json(
      { error: `不支持的文件类型「${ext || "无扩展名"}」` },
      { status: 400 }
    );
  }
  const safeName = `${id}${isImage ? sniffedExt : ext}`;

  const dir = isImage
    ? path.join(process.cwd(), "public", "uploads")
    : path.join(process.cwd(), "data", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), buffer);

  let extractedText: string | null = null;
  if (!isImage) {
    extractedText = await extractText(file.name, file.type, buffer);
  }

  await db.insert(schema.attachments).values({
    id,
    ownerId: session.user.id,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    storagePath: isImage ? `/uploads/${safeName}` : `data/uploads/${safeName}`,
    extractedText,
  });

  return Response.json({
    id,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    url: isImage ? `/uploads/${safeName}` : undefined,
    hasText: !!extractedText,
  });
}

async function extractText(
  name: string,
  mimeType: string,
  buffer: Buffer
): Promise<string | null> {
  try {
    const lower = name.toLowerCase();
    if (
      mimeType.startsWith("text/") ||
      lower.endsWith(".md") ||
      lower.endsWith(".txt") ||
      lower.endsWith(".csv") ||
      lower.endsWith(".json")
    ) {
      return buffer.toString("utf-8").slice(0, 100_000);
    }
    if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const data = await parser.getText();
      await parser.destroy();
      return data.text.slice(0, 100_000);
    }
    if (lower.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value.slice(0, 100_000);
    }
  } catch {
    return null;
  }
  return null;
}

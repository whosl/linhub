import { NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

export const maxDuration = 60;

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/** 聊天/项目附件上传：图片直接可访问，文档抽取文本供模型理解 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

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
  const ext = path.extname(file.name) || "";
  const safeName = `${id}${ext}`;

  const isImage = file.type.startsWith("image/");
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

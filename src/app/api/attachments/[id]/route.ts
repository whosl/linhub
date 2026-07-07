import { eq, and } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

const PUBLIC_UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
const DATA_UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

function localAttachmentPath(storagePath: string) {
  const filename = path.basename(storagePath);
  if (!filename || filename === "." || filename === "..") return null;
  if (storagePath.startsWith("/uploads/")) {
    return path.join(PUBLIC_UPLOADS_DIR, filename);
  }
  if (storagePath.startsWith("data/uploads/")) {
    return path.join(DATA_UPLOADS_DIR, filename);
  }
  return null;
}

/** 删除附件（项目文件或对话附件）。鉴权：只能删自己的。 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession().catch(() => null);
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;

  // 只能删自己的附件
  const [att] = await db
    .select({ id: schema.attachments.id, storagePath: schema.attachments.storagePath })
    .from(schema.attachments)
    .where(and(eq(schema.attachments.id, id), eq(schema.attachments.ownerId, session.user.id)))
    .limit(1);
  if (!att) return Response.json({ error: "文件不存在" }, { status: 404 });

  await db.delete(schema.attachments).where(eq(schema.attachments.id, id));

  // 尝试删本地文件（图片在 public/uploads，文档在 data/uploads；失败不阻塞）
  try {
    const filePath = localAttachmentPath(att.storagePath);
    if (filePath) await unlink(filePath);
  } catch {
    // 文件可能已删或路径不对，忽略
  }

  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";

/**
 * 遗留公开路径兼容：历史消息仍引用 /generated/{filename}。
 * 文件已迁入 media_assets，按文件名 + 当前用户归属解析并鉴权输出。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const { name } = await params;
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return Response.json({ error: "无效路径" }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.ownerId, session.user.id),
        eq(schema.mediaAssets.name, name)
      )
    )
    .limit(1);

  if (!row) {
    return Response.json({ error: "不存在" }, { status: 404 });
  }

  try {
    const buffer = await readFile(path.join(process.cwd(), row.storageKey));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "文件缺失" }, { status: 404 });
  }
}

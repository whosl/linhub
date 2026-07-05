import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { decryptSecret } from "@/lib/server/crypto";

export const maxDuration = 60;

/** 测试 MCP 连接：拉取工具列表并落库 */
export async function POST(
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
  const [server] = await db
    .select()
    .from(schema.mcpServers)
    .where(eq(schema.mcpServers.id, id));
  if (!server) return Response.json({ error: "不存在" }, { status: 404 });
  if (server.scope === "user" && server.ownerId !== session.user.id) {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { createMCPClient } = await import("@ai-sdk/mcp");
    const headers = server.headersEncrypted
      ? (JSON.parse(decryptSecret(server.headersEncrypted)) as Record<string, string>)
      : undefined;
    const client = await createMCPClient({
      transport: { type: "sse", url: server.url, headers },
    });
    const toolSet = await client.tools();
    const tools = Object.entries(toolSet).map(([name, t]) => ({
      name,
      description: (t as { description?: string }).description,
    }));
    await client.close();
    await db
      .update(schema.mcpServers)
      .set({ status: "connected", tools })
      .where(eq(schema.mcpServers.id, id));
    return Response.json({ ok: true, tools });
  } catch (e) {
    await db
      .update(schema.mcpServers)
      .set({ status: "error" })
      .where(eq(schema.mcpServers.id, id));
    return Response.json({
      ok: false,
      tools: [],
      error: e instanceof Error ? e.message : "连接失败",
    });
  }
}

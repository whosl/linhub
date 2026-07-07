import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { decryptSecret } from "@/lib/server/crypto";

export const maxDuration = 60;

function formatMcpTestError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e ?? "");
  if (
    /fetch failed|network|ECONN|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|timeout|AbortError/i.test(
      message
    )
  ) {
    return "无法连接 MCP 服务器，请确认服务正在运行且 URL/传输方式正确";
  }
  return message || "连接失败";
}

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

  let client: { tools: () => Promise<Record<string, unknown>>; close: () => Promise<void> } | null =
    null;
  try {
    // SSRF 防护：禁止指向内网/元数据地址
    const { assertSafeUrl } = await import("@/lib/server/net-guard");
    await assertSafeUrl(server.url);
    const { createMCPClient } = await import("@ai-sdk/mcp");
    const headers = server.headersEncrypted
      ? (JSON.parse(decryptSecret(server.headersEncrypted)) as Record<string, string>)
      : undefined;
    // I6: 按存储的 transport 列选择传输方式（DB 枚举 'streamable-http' → 客户端 'http'），
    // 之前两处都硬编码 'sse'，导致该列实际失效。
    client = await createMCPClient({
      transport: {
        type: server.transport === "streamable-http" ? "http" : "sse",
        url: server.url,
        headers,
      },
    });
    const toolSet = await client.tools();
    const tools = Object.entries(toolSet).map(([name, t]) => ({
      name,
      description: (t as { description?: string }).description,
    }));
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
      error: formatMcpTestError(e),
    });
  } finally {
    await client?.close().catch(() => {});
  }
}

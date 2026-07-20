import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import type { McpServer } from "@/lib/types";

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

function mcpToUi(s: typeof schema.mcpServers.$inferSelect): McpServer {
  let headersMasked: Record<string, string> | undefined;
  if (s.headersEncrypted) {
    try {
      const headers = JSON.parse(decryptSecret(s.headersEncrypted)) as Record<string, string>;
      headersMasked = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k, v.length > 8 ? `${v.slice(0, 4)}…${v.slice(-4)}` : "****"])
      );
    } catch {
      headersMasked = undefined;
    }
  }
  return {
    id: s.id,
    scope: s.scope,
    ownerId: s.ownerId ?? undefined,
    name: s.name,
    url: s.url,
    transport: s.transport,
    headersMasked,
    enabled: s.enabled,
    defaultEnabled: s.defaultEnabled,
    status: s.status,
    tools: s.tools,
  };
}

function validateHeaders(input: Record<string, string> | undefined) {
  if (input === undefined) return null;
  const entries = Object.entries(input);
  if (entries.length > 20) return "请求头不能超过 20 项";
  const seen = new Set<string>();
  for (const [rawName, value] of entries) {
    const name = rawName.trim();
    const lower = name.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return `请求头名称无效：${rawName}`;
    if (seen.has(lower)) return `请求头名称重复：${name}`;
    if (["host", "content-length", "connection", "transfer-encoding"].includes(lower)) {
      return `不允许设置请求头：${name}`;
    }
    if (typeof value !== "string" || value.length > 4096 || /[\r\n]/.test(value)) {
      return `请求头值无效：${name}`;
    }
    seen.add(lower);
  }
  return null;
}

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const scope = req.nextUrl.searchParams.get("scope") === "global" ? "global" : "user";
  // 全局 MCP 是管理员配置的基础能力，普通用户自动使用但不暴露服务器元数据。
  if (scope === "global" && session.user.role !== "admin") {
    return Response.json([]);
  }
  const rows =
    scope === "global"
      ? await db
          .select()
          .from(schema.mcpServers)
          .where(eq(schema.mcpServers.scope, "global"))
          .orderBy(desc(schema.mcpServers.createdAt))
      : await db
          .select()
          .from(schema.mcpServers)
          .where(
            and(
              eq(schema.mcpServers.scope, "user"),
              eq(schema.mcpServers.ownerId, session.user.id)
            )
          )
          .orderBy(desc(schema.mcpServers.createdAt));
  return Response.json(rows.map(mcpToUi));
}

/** 创建/更新 MCP server（global 仅管理员） */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await req.json()) as Partial<McpServer> & {
    name: string;
    url: string;
    headers?: Record<string, string>;
  };
  const scope = body.scope === "global" ? "global" : "user";
  if (scope === "global" && session.user.role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }
  if (!body.name?.trim() || !body.url?.trim()) {
    return Response.json({ error: "名称与 URL 不能为空" }, { status: 400 });
  }
  const headerError = validateHeaders(body.headers);
  if (headerError) return Response.json({ error: headerError }, { status: 400 });

  try {
    const { assertSafeUrl } = await import("@/lib/server/net-guard");
    await assertSafeUrl(body.url.trim());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "URL 不安全" },
      { status: 400 }
    );
  }

  const headersSpecified = body.headers !== undefined;
  const headersEncrypted =
    body.headers && Object.keys(body.headers).length > 0
      ? encryptSecret(JSON.stringify(body.headers))
      : null;

  if (body.id) {
    const [existing] = await db
      .select()
      .from(schema.mcpServers)
      .where(eq(schema.mcpServers.id, body.id));
    if (!existing) return Response.json({ error: "不存在" }, { status: 404 });
    if (existing.scope === "user" && existing.ownerId !== session.user.id) {
      return Response.json({ error: "无权限" }, { status: 403 });
    }
    if (existing.scope === "global" && session.user.role !== "admin") {
      return Response.json({ error: "无权限" }, { status: 403 });
    }
    await db
      .update(schema.mcpServers)
      .set({
        name: body.name,
        url: body.url,
        transport: body.transport ?? existing.transport,
        enabled: body.enabled ?? existing.enabled,
        defaultEnabled:
          typeof body.defaultEnabled === "boolean"
            ? body.defaultEnabled
            : existing.defaultEnabled,
        ...(headersSpecified ? { headersEncrypted } : {}),
      })
      .where(eq(schema.mcpServers.id, body.id));
    const [row] = await db
      .select()
      .from(schema.mcpServers)
      .where(eq(schema.mcpServers.id, body.id));
    return Response.json(mcpToUi(row));
  }

  const id = `mcp-${uid()}`;
  await db.insert(schema.mcpServers).values({
    id,
    scope,
    ownerId: scope === "user" ? session.user.id : null,
    name: body.name,
    url: body.url,
    transport: body.transport ?? "streamable-http",
    headersEncrypted: headersEncrypted ?? undefined,
    enabled: body.enabled ?? true,
    // 全局 MCP 默认不对用户自动开启，需用户勾选或管理员改 defaultEnabled
    defaultEnabled: body.defaultEnabled ?? false,
  });
  const [row] = await db.select().from(schema.mcpServers).where(eq(schema.mcpServers.id, id));
  return Response.json(mcpToUi(row));
}

import "server-only";

import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { decryptSecret } from "@/lib/server/crypto";
import { db, schema } from "@/lib/server/db";
import { buildWebTools } from "@/lib/server/llm/tools";
import { assertSafeUrl } from "@/lib/server/net-guard";

export const ZHIPU_RESEARCH_SERVERS = {
  search: "mcp-zhipu-web-search",
  reader: "mcp-zhipu-web-reader",
  zread: "mcp-zhipu-zread",
} as const;

export type ResearchLocale = "zh" | "foreign" | "mixed";

export function researchProviderInstructions(locale: ResearchLocale) {
  const searchOrder =
    locale === "zh"
      ? "中文和中国来源优先调用智谱 web_search_prime；结果不足再调用 Tavily web_search。"
      : locale === "foreign"
        ? "外文和国际来源优先调用 Tavily web_search；结果不足再调用智谱 web_search_prime。"
        : "中文子问题优先智谱，外文子问题优先 Tavily，不要对每个查询无差别调用全部引擎。";
  return [
    searchOrder,
    "读取具体网页时优先调用智谱 webReader；失败后调用 Tavily web_read，仍失败或需要站点级内容时调用 web_crawl。",
    "研究 GitHub 仓库、Issue、Commit 时优先使用智谱 Zread。",
    "优先政府、监管、论文、公司公告和官方文档；记录标题、URL、发布日期，并合并重复来源。",
  ].join("\n");
}

export async function buildResearchToolBundle(userId: string) {
  const servers = await db
    .select()
    .from(schema.mcpServers)
    .where(
      and(
        eq(schema.mcpServers.enabled, true),
        eq(schema.mcpServers.scope, "global"),
        inArray(schema.mcpServers.id, Object.values(ZHIPU_RESEARCH_SERVERS))
      )
    );
  const clients: Awaited<ReturnType<typeof createMCPClient>>[] = [];
  const mcpTools: ToolSet = {};
  const mountedServers: Array<{ id: string; name: string; toolNames: string[] }> = [];
  await Promise.all(
    servers.map(async (server) => {
      let client: Awaited<ReturnType<typeof createMCPClient>> | null = null;
      try {
        await assertSafeUrl(server.url);
        const headers = server.headersEncrypted
          ? (JSON.parse(decryptSecret(server.headersEncrypted)) as Record<string, string>)
          : undefined;
        client = await createMCPClient({
          transport: {
            type: server.transport === "streamable-http" ? "http" : "sse",
            url: server.url,
            headers,
          },
        });
        const serverTools = (await client.tools()) as ToolSet;
        const prefix = server.name.replace(/\W+/gu, "_").replace(/^_+|_+$/gu, "");
        const toolNames: string[] = [];
        for (const [name, definition] of Object.entries(serverTools)) {
          const exposedName = `${prefix}_${name}`;
          mcpTools[exposedName] = definition;
          toolNames.push(exposedName);
        }
        clients.push(client);
        mountedServers.push({ id: server.id, name: server.name, toolNames });
      } catch {
        await client?.close().catch(() => undefined);
      }
    })
  );
  return {
    tools: {
      ...buildWebTools(userId),
      ...mcpTools,
    } satisfies ToolSet,
    mountedServers,
    close: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
  };
}

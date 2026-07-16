import "server-only";

import type { ToolSet } from "ai";
import { buildMcpTools, buildWebTools } from "@/lib/server/llm/tools";

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
  const mcp = await buildMcpTools(userId, [], {
    globalServerIds: Object.values(ZHIPU_RESEARCH_SERVERS),
  });
  return {
    tools: {
      ...buildWebTools(userId),
      ...mcp.tools,
    } satisfies ToolSet,
    mountedServers: mcp.mountedServers,
    close: mcp.close,
  };
}

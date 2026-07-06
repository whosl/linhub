import { tool, type ToolSet } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";
import { resolveModel } from "./registry";
import type { WebSource } from "@/lib/types";

// ---------- Tavily ----------

async function getTavilyKey(): Promise<string | null> {
  const [s] = await db
    .select({ key: schema.settings.tavilyApiKeyEncrypted })
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"));
  return s?.key ? decryptSecret(s.key) : null;
}

async function tavilyRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = await getTavilyKey();
  if (!key) throw new Error("管理员尚未配置 Tavily API Key");
  const base = process.env.TAVILY_BASE_URL ?? "https://api.tavily.com";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Tavily 请求失败（${res.status}）`);
  return res.json() as Promise<T>;
}

export function buildWebTools(): ToolSet {
  return {
    web_search: tool({
      description: "在互联网上搜索最新信息。适用于时效性问题、事实核查、调研。",
      inputSchema: z.object({
        query: z.string().describe("搜索关键词"),
        searchDepth: z
          .enum(["basic", "advanced"])
          .optional()
          .describe("advanced 用于深度调研"),
      }),
      execute: async ({ query, searchDepth }) => {
        const data = await tavilyRequest<{
          results: { title: string; url: string; content: string }[];
          answer?: string;
        }>("/search", {
          query,
          search_depth: searchDepth ?? "basic",
          max_results: 6,
          include_answer: true,
        });
        const sources: WebSource[] = data.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content.slice(0, 200),
        }));
        return { answer: data.answer, sources };
      },
    }),
    web_read: tool({
      description: "读取指定网页的完整内容。",
      inputSchema: z.object({
        url: z.string().describe("要读取的网页 URL"),
      }),
      execute: async ({ url }) => {
        const data = await tavilyRequest<{
          results: { url: string; raw_content: string }[];
        }>("/extract", { urls: [url] });
        const content = data.results[0]?.raw_content ?? "";
        return {
          sources: [{ title: url, url }] satisfies WebSource[],
          text: content.slice(0, 20_000),
        };
      },
    }),
    web_crawl: tool({
      description: "爬取一个网站的多个页面，适用于需要站点级信息的任务。",
      inputSchema: z.object({
        url: z.string().describe("起始 URL"),
        instructions: z.string().optional().describe("爬取目标说明"),
      }),
      execute: async ({ url, instructions }) => {
        const data = await tavilyRequest<{
          results: { url: string; raw_content: string }[];
        }>("/crawl", { url, instructions, limit: 5 });
        return {
          sources: data.results.map((r) => ({
            title: r.url,
            url: r.url,
            snippet: r.raw_content.slice(0, 150),
          })) satisfies WebSource[],
          text: data.results
            .map((r) => `## ${r.url}\n${r.raw_content.slice(0, 4000)}`)
            .join("\n\n"),
        };
      },
    }),
  };
}

// ---------- 图像生成 / 编辑（gpt-image-2） ----------

async function getImageModelConfig() {
  const rows = await db
    .select({ model: schema.models, provider: schema.providers })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .where(eq(schema.models.enabled, true));
  const found = rows.find((r) =>
    (r.model.capabilities as string[]).includes("image-generation")
  );
  if (!found) throw new Error("未配置图像生成模型");
  if (!found.provider.apiKeyEncrypted)
    throw new Error(`供应商 ${found.provider.name} 未配置 API Key`);
  return {
    record: found.model,
    apiKey: decryptSecret(found.provider.apiKeyEncrypted),
    baseURL: found.provider.baseUrl || "https://api.openai.com/v1",
  };
}

export function buildImageTools(userId: string, onImage: (url: string) => void): ToolSet {
  return {
    generate_image: tool({
      description:
        "根据文字描述生成图片。把用户的需求扩写为详细的英文 prompt 效果更好。",
      inputSchema: z.object({
        prompt: z.string().describe("详细的图片描述（英文效果更佳）"),
        size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).optional(),
      }),
      execute: async ({ prompt, size }) => {
        const { record, apiKey, baseURL } = await getImageModelConfig();
        // 生图前预检余额/额度（C4）
        const { assertCanSpend } = await import("@/lib/server/billing");
        await assertCanSpend(userId);
        const res = await fetch(`${baseURL}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: record.slug,
            prompt,
            size: size ?? "1024x1024",
            n: 1,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`生图失败（${res.status}）: ${err.slice(0, 200)}`);
        }
        const data = (await res.json()) as {
          data: { b64_json?: string; url?: string }[];
        };
        const item = data.data[0];
        let url = item.url ?? "";
        if (item.b64_json) {
          url = await saveGeneratedImage(userId, item.b64_json);
        }
        // I7: 仅在确实拿到图片 URL 时才回调与计费，避免空结果也扣费
        if (!url) throw new Error("生图失败：上游未返回图片 URL");
        onImage(url);
        // 生图计费：记录用量并扣订阅额度/余额（C4）；costCents 夹下界防 pricePerImage 为负
        const { recordUsage } = await import("@/lib/server/billing");
        await recordUsage(userId, record, null, {
          inputTokens: 0,
          outputTokens: 0,
          imageCount: 1,
          costCents: Math.max(0, record.pricePerImage ?? 0),
        });
        return { images: [url], text: "图片已生成并展示给用户" };
      },
    }),
  };
}

async function saveGeneratedImage(userId: string, b64: string): Promise<string> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const dir = `${process.cwd()}/public/generated`;
  await mkdir(dir, { recursive: true });
  const name = `${userId.slice(0, 6)}-${Date.now()}.png`;
  await writeFile(`${dir}/${name}`, Buffer.from(b64, "base64"));
  return `/generated/${name}`;
}

// ---------- 辅助识图 ----------

export function buildVisionTool(): ToolSet {
  return {
    analyze_image: tool({
      description: "分析一张图片的内容（当你自己无法直接看图时使用）。",
      inputSchema: z.object({
        imageUrl: z.string().describe("图片 URL"),
        question: z.string().optional().describe("关于图片想了解什么"),
      }),
      execute: async ({ imageUrl, question }) => {
        // C1: 校验图片 URL，防止被 prompt 注入用于拉取内网/云元数据（SSRF）
        const { assertSafeUrl } = await import("@/lib/server/net-guard");
        await assertSafeUrl(imageUrl);
        const [s] = await db
          .select({ helper: schema.settings.visionHelperModelId })
          .from(schema.settings)
          .where(eq(schema.settings.id, "global"));
        if (!s?.helper) throw new Error("管理员尚未配置辅助识图模型");
        const { model } = await resolveModel(s.helper);
        const { generateText } = await import("ai");
        const { text } = await generateText({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", image: new URL(imageUrl) },
                { type: "text", text: question ?? "详细描述这张图片的内容。" },
              ],
            },
          ],
        });
        return { text };
      },
    }),
  };
}

// ---------- Artifacts ----------

const artifactKinds = ["html", "react", "svg", "markdown", "code", "mermaid"] as const;

export function buildArtifactTools(conversationId: string): ToolSet {
  return {
    create_artifact: tool({
      description:
        "为用户创建一个 Artifact（独立展示的内容作品），适用于完整网页、React 组件、SVG 图形、长文档、完整代码文件、Mermaid 图表。内容会在右侧面板中展示，不要再在回复中重复完整内容。",
      inputSchema: z.object({
        title: z.string().describe("作品标题"),
        kind: z.enum(artifactKinds).describe("作品类型"),
        language: z.string().optional().describe("kind=code 时的编程语言"),
        content: z.string().describe("完整内容"),
      }),
      execute: async ({ title, kind, language, content }) => {
        const id = `art-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        await db.insert(schema.artifacts).values({
          id,
          conversationId,
          title,
          kind,
          language,
          versions: [{ version: 1, content, createdAt: new Date().toISOString() }],
          currentVersion: 1,
        });
        return { artifactId: id, text: `已创建 Artifact「${title}」` };
      },
    }),
    update_artifact: tool({
      description: "更新一个已存在的 Artifact，生成新版本。",
      inputSchema: z.object({
        artifactId: z.string().describe("要更新的 artifact id"),
        content: z.string().describe("更新后的完整内容"),
      }),
      execute: async ({ artifactId, content }) => {
        // 只允许更新当前会话内的 artifact（防跨会话越权写）
        const scope = and(
          eq(schema.artifacts.id, artifactId),
          eq(schema.artifacts.conversationId, conversationId)
        );
        const [existing] = await db.select().from(schema.artifacts).where(scope);
        if (!existing) throw new Error("Artifact 不存在");
        const nextVersion = existing.currentVersion + 1;
        await db
          .update(schema.artifacts)
          .set({
            versions: [
              ...existing.versions,
              { version: nextVersion, content, createdAt: new Date().toISOString() },
            ],
            currentVersion: nextVersion,
            updatedAt: new Date(),
          })
          .where(scope);
        return { artifactId, text: `已更新 Artifact「${existing.title}」到 v${nextVersion}` };
      },
    }),
  };
}

// ---------- 记忆 ----------

export function buildMemoryTools(userId: string, conversationId: string): ToolSet {
  return {
    save_memory: tool({
      description:
        "保存关于用户的重要长期信息（偏好、背景、事实），供以后的对话使用。只在用户提到值得长期记住的信息时使用。",
      inputSchema: z.object({
        content: z.string().describe("要记住的内容，一句话概括"),
      }),
      execute: async ({ content }) => {
        const id = `mem-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        let embedding: number[] | null = null;
        try {
          const { embedText } = await import("./embedding");
          embedding = await embedText(content);
        } catch {
          // 未配置 embedding 时保存纯文本，检索退化为关键词匹配
        }
        await db.insert(schema.memories).values({
          id,
          ownerId: userId,
          content,
          sourceConversationId: conversationId,
          embedding,
        });
        return { text: `已记住：${content}` };
      },
    }),
    search_memory: tool({
      description: "检索之前保存的关于用户的记忆。",
      inputSchema: z.object({
        query: z.string().describe("检索关键词"),
      }),
      execute: async ({ query }) => {
        const results = await searchMemories(userId, query, 5);
        if (results.length === 0) return { text: "没有找到相关记忆" };
        return { text: results.map((m, i) => `${i + 1}. ${m}`).join("\n") };
      },
    }),
  };
}

export async function searchMemories(
  userId: string,
  query: string,
  limit: number
): Promise<string[]> {
  try {
    const { embedText } = await import("./embedding");
    const queryEmbedding = await embedText(query);
    const { cosineDistance, desc: descOp, sql: sqlOp } = await import("drizzle-orm");
    const similarity = sqlOp<number>`1 - (${cosineDistance(schema.memories.embedding, queryEmbedding)})`;
    const rows = await db
      .select({ content: schema.memories.content, similarity })
      .from(schema.memories)
      .where(eq(schema.memories.ownerId, userId))
      .orderBy((t) => descOp(t.similarity))
      .limit(limit);
    return rows.filter((r) => r.similarity > 0.3).map((r) => r.content);
  } catch {
    // 无 embedding：关键词退化匹配
    const { ilike, and: andOp } = await import("drizzle-orm");
    const rows = await db
      .select({ content: schema.memories.content })
      .from(schema.memories)
      .where(
        andOp(
          eq(schema.memories.ownerId, userId),
          ilike(schema.memories.content, `%${query.slice(0, 20)}%`)
        )
      )
      .limit(limit);
    return rows.map((r) => r.content);
  }
}

/** 开场注入：取用户最近的记忆拼进系统提示词 */
export async function loadRecentMemories(userId: string, limit = 10): Promise<string[]> {
  const { desc: descOp } = await import("drizzle-orm");
  const rows = await db
    .select({ content: schema.memories.content })
    .from(schema.memories)
    .where(eq(schema.memories.ownerId, userId))
    .orderBy(descOp(schema.memories.updatedAt))
    .limit(limit);
  return rows.map((r) => r.content);
}

// ---------- 知识库检索 ----------

export function buildKnowledgeTool(userId: string, kbIds: string[]): ToolSet {
  if (kbIds.length === 0) return {};
  return {
    search_knowledge: tool({
      description: "在用户挂载的知识库中检索相关内容。回答引用检索结果时注明来源文档。",
      inputSchema: z.object({
        query: z.string().describe("检索问题或关键词"),
      }),
      execute: async ({ query }) => {
        const { embedText } = await import("./embedding");
        const queryEmbedding = await embedText(query);
        const { cosineDistance, desc: descOp, sql: sqlOp, inArray } = await import("drizzle-orm");
        const similarity = sqlOp<number>`1 - (${cosineDistance(schema.kbChunks.embedding, queryEmbedding)})`;
        const rows = await db
          .select({
            documentId: schema.kbChunks.documentId,
            chunkIndex: schema.kbChunks.chunkIndex,
            content: schema.kbChunks.content,
            similarity,
            documentName: schema.kbDocuments.name,
          })
          .from(schema.kbChunks)
          .innerJoin(schema.kbDocuments, eq(schema.kbChunks.documentId, schema.kbDocuments.id))
          .innerJoin(
            schema.knowledgeBases,
            eq(schema.kbChunks.knowledgeBaseId, schema.knowledgeBases.id)
          )
          .where(
            and(
              inArray(schema.kbChunks.knowledgeBaseId, kbIds),
              // 只允许检索当前用户自己的知识库（防 IDOR）
              eq(schema.knowledgeBases.ownerId, userId)
            )
          )
          .orderBy((t) => descOp(t.similarity))
          .limit(6);
        const hits = rows.filter((r) => r.similarity > 0.2);
        if (hits.length === 0) return { text: "知识库中没有找到相关内容" };
        return {
          chunks: hits.map((r) => ({
            documentId: r.documentId,
            documentName: r.documentName,
            chunkIndex: r.chunkIndex,
            snippet: r.content.slice(0, 300),
            score: Math.round(r.similarity * 100) / 100,
          })),
          text: hits
            .map((r, i) => `[${i + 1}] 《${r.documentName}》#${r.chunkIndex}:\n${r.content}`)
            .join("\n\n"),
        };
      },
    }),
  };
}

// ---------- MCP ----------

export async function buildMcpTools(
  userId: string,
  enabledUserServerIds: string[]
): Promise<{ tools: ToolSet; close: () => Promise<void> }> {
  const servers = await db
    .select()
    .from(schema.mcpServers)
    .where(eq(schema.mcpServers.enabled, true));

  const active = servers.filter(
    (s) =>
      s.scope === "global" ||
      (s.ownerId === userId && enabledUserServerIds.includes(s.id))
  );

  const clients: Awaited<ReturnType<typeof createMCPClient>>[] = [];
  const tools: ToolSet = {};

  const timeout = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([
      p,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("MCP 连接超时")), ms)
      ),
    ]);

  for (const server of active) {
    try {
      // SSRF 防护：禁止指向内网/元数据地址
      const { assertSafeUrl } = await import("@/lib/server/net-guard");
      await assertSafeUrl(server.url);
      const headers = server.headersEncrypted
        ? (JSON.parse(decryptSecret(server.headersEncrypted)) as Record<string, string>)
        : undefined;
      // 单服务器 10s 超时，防止慢/挂的 MCP 拖死整个聊天请求
      const client = await timeout(
        createMCPClient({
          // I6: 按 server.transport 选择传输（'streamable-http' → 'http'）
          transport: {
            type: server.transport === "streamable-http" ? "http" : "sse",
            url: server.url,
            headers,
          },
        }),
        10_000
      );
      clients.push(client);
      const serverTools = (await timeout(client.tools(), 10_000)) as ToolSet;
      for (const [name, t] of Object.entries(serverTools)) {
        tools[`${server.name.replace(/\W+/g, "_")}_${name}`] = t;
      }
    } catch {
      // MCP 服务器不可用时跳过，不阻塞聊天
    }
  }

  return {
    tools,
    close: async () => {
      await Promise.allSettled(clients.map((c) => c.close()));
    },
  };
}

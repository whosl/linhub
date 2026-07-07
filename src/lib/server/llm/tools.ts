import { tool, type ToolSet } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { z } from "zod";
import { and, eq, or, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";
import { resolveImageSource } from "./image-source";
import { getProviderBaseURL, resolveModel } from "./registry";
import { formatUpstreamError } from "@/lib/server/upstream-error";
import { getImageGenConfig, getSearchConfig } from "@/lib/server/engine-config";
import { assertModelAccess } from "@/lib/server/billing";
import { assertSafeUrl } from "@/lib/server/net-guard";
import type { WebSource } from "@/lib/types";

// ---------- Tavily ----------

async function tavilyRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { apiKey, baseURL } = await getSearchConfig();
  // 网络抖动时 fetch 会直接抛 "fetch failed"（TCP/DNS 层），模型只能靠运气重试。
  // 这里加 15s 超时 + 1 次自动重试，消除大部分偶发失败。
  const doFetch = () =>
    fetch(`${baseURL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  let res: Response;
  try {
    res = await doFetch();
  } catch {
    // 4xx 业务错误（如 key 失效/限流）不会进 catch（res.ok 在下方判断），
    // 只有网络层失败才重试一次
    res = await doFetch().catch((secondErr) => {
      throw new Error(
        `Tavily 网络请求失败（已重试）：${secondErr instanceof Error ? secondErr.message : String(secondErr)}`
      );
    });
  }
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

// ---------- 代码运行 ----------

const CODE_MAX_LENGTH = 8_000;
const CODE_OUTPUT_MAX_LENGTH = 4_000;

function formatCodeValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "undefined") return "";
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function assertSafeJavaScriptSnippet(code: string) {
  if (code.length > CODE_MAX_LENGTH) {
    throw new Error(`代码过长，最多 ${CODE_MAX_LENGTH} 个字符`);
  }
  const blocked = /\b(?:process|require|module|exports|import|eval|Function|constructor|globalThis|global|fetch|XMLHttpRequest|WebSocket|Worker|Deno|Bun|this|new|class|while|for|async|await)\b/;
  if (blocked.test(code)) {
    throw new Error("代码包含受限 API；只能运行短小、无网络、无文件访问的 JavaScript 片段");
  }
}

function evaluateArithmeticExpression(expression: string): unknown {
  const expr = expression.trim();
  if (!expr) return "";
  if (!/^[\d\s+\-*/%().,]+$/.test(expr)) {
    throw new Error("当前代码工具仅支持数字、括号与基础四则运算表达式");
  }
  // 前面已禁止所有标识符和字符串，Function 只用于计算纯算术表达式。
  return Function(`"use strict"; return (${expr});`)();
}

async function runJavaScriptSnippet(code: string): Promise<string> {
  assertSafeJavaScriptSnippet(code);
  const logs: string[] = [];
  const statements = code
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    const consoleCall = statement.match(
      /^console\.(?:log|info|warn|error)\(([\s\S]*)\)$/
    );
    const expr = consoleCall?.[1] ?? statement.replace(/^return\s+/, "");
    const resultText = formatCodeValue(evaluateArithmeticExpression(expr));
    if (resultText) logs.push(resultText);
  }
  const output = logs.join("\n") || "（无输出）";
  return output.slice(0, CODE_OUTPUT_MAX_LENGTH);
}

export function buildCodeTools(): ToolSet {
  return {
    run_code: tool({
      description:
        "安全计算一小段 JavaScript 风格的算术表达式，支持 console.log(7*6) 这类数字计算；不支持网络、文件、变量、循环或外部依赖。适用于用户要求验证简单代码/计算结果时；不要用联网搜索代替代码运行。",
      inputSchema: z.object({
        language: z
          .enum(["javascript", "js"])
          .describe("代码语言；当前仅支持 JavaScript"),
        code: z.string().describe("要执行的短 JavaScript 代码"),
      }),
      execute: async ({ code }) => {
        const output = await runJavaScriptSnippet(code);
        return { text: output };
      },
    }),
  };
}

// ---------- 图像生成 / 编辑（gpt-image-2） ----------

class RetryableImageError extends Error {}

const REMOTE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_REMOTE_IMAGE_REDIRECTS = 5;

function imageExtensionFromContentType(contentType: string | null): string | null {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  if (type === "image/png") return ".png";
  if (type === "image/jpeg" || type === "image/jpg") return ".jpg";
  if (type === "image/webp") return ".webp";
  return null;
}

async function saveRemoteGeneratedImage(userId: string, remoteUrl: string): Promise<string> {
  const res = await fetchSafeRemoteImage(remoteUrl);
  if (!res.ok) throw new Error(await formatUpstreamError(res, "下载生图结果失败"));

  const ext = imageExtensionFromContentType(res.headers.get("content-type"));
  if (!ext) throw new Error("生图结果图片格式不受支持");
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > REMOTE_IMAGE_MAX_BYTES) throw new Error("生图结果图片过大");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > REMOTE_IMAGE_MAX_BYTES) throw new Error("生图结果图片过大");

  const { mkdir, writeFile } = await import("node:fs/promises");
  const dir = `${process.cwd()}/public/generated`;
  await mkdir(dir, { recursive: true });
  const name = `${userId.slice(0, 6)}-${Date.now()}-${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)}${ext}`;
  await writeFile(`${dir}/${name}`, buffer);
  return `/generated/${name}`;
}

async function fetchSafeRemoteImage(rawUrl: string): Promise<Response> {
  let url = rawUrl;
  for (let redirects = 0; redirects <= MAX_REMOTE_IMAGE_REDIRECTS; redirects++) {
    await assertSafeUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS),
    });
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;

    const location = res.headers.get("location");
    if (!location) throw new Error("下载生图结果失败：重定向缺少 Location");
    url = new URL(location, url).toString();
  }
  throw new Error("下载生图结果失败：重定向次数过多");
}

function isRetryableImageError(e: unknown) {
  if (e instanceof RetryableImageError) return true;
  return (
    e instanceof Error &&
    /fetch failed|network|timeout|ECONN|ETIMEDOUT|AbortError/i.test(e.message)
  );
}

export async function getImageModelConfig() {
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
    baseURL: getProviderBaseURL(found.provider) ?? "https://api.openai.com/v1",
  };
}

export function buildImageTools(userId: string, onImage: (url: string) => void): ToolSet {
  return {
    generate_image: tool({
      description:
        "生成图片。当用户要求画图、生成图片、设计图、画 XX 时，直接调用此工具，不要只给文字描述或 prompt。调用前自行把用户的中文需求扩写为详细的英文 prompt 作为参数传入。",
      inputSchema: z.object({
        prompt: z.string().describe("详细的英文图片描述（由你根据用户需求扩写）"),
        size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).optional(),
      }),
      execute: async ({ prompt, size }) => {
        const imgConfig = await getImageGenConfig();
        const { apiKey, baseURL, model, record } = imgConfig;
        if (record) await assertModelAccess(userId, record);
        const pricePerImage = Math.max(0, record?.pricePerImage ?? 30);
        const {
          recordReservedUsage,
          refundSpendReservation,
          reserveSpend,
        } = await import("@/lib/server/billing");
        const reservation =
          record && pricePerImage > 0
            ? await reserveSpend(
                userId,
                pricePerImage,
                `${record.displayName} 生图消费`
              )
            : null;

        // 网关偶发返回空 200，封装请求 + 重试
        // 生图通常 10-60s，给 120s 超时；重试一次也要留在聊天路由 300s 内。
        // 超时抛 TimeoutError（消息含 timeout）会被 isRetryableImageError 识别并重试一次。
        const doGenerate = async () => {
          const res = await fetch(`${baseURL}/images/generations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              prompt,
              size: size ?? "1024x1024",
              n: 1,
            }),
            signal: AbortSignal.timeout(120_000),
          });
          if (!res.ok) {
            const message = await formatUpstreamError(res, "生图失败");
            if (
              res.status === 408 ||
              res.status === 409 ||
              res.status === 425 ||
              res.status === 429 ||
              res.status >= 500
            ) {
              throw new RetryableImageError(message);
            }
            throw new Error(message);
          }
          // 网关偶发返回 200 但空响应体（application/octet-stream, 0 bytes）
          const text = await res.text();
          if (!text.trim()) {
            throw new RetryableImageError("生图上游返回空响应（网关异常），请稍后重试");
          }
          try {
            return JSON.parse(text) as { data: { b64_json?: string; url?: string }[] };
          } catch {
            throw new RetryableImageError(
              `生图上游返回了非 JSON 响应（${text.slice(0, 100)}），请稍后重试`
            );
          }
        };

        try {
          let data: { data: { b64_json?: string; url?: string }[] };
          try {
            data = await doGenerate();
          } catch (e) {
            if (!isRetryableImageError(e)) throw e;
            // 仅对网络/限流/5xx/网关空响应等瞬时错误重试一次。
            data = await doGenerate();
          }
          const item = data.data[0];
          if (item.b64_json) {
            const url = await saveGeneratedImage(userId, item.b64_json);
            if (record) await recordReservedUsage(userId, record, null, {
              inputTokens: 0,
              outputTokens: 0,
              imageCount: 1,
              costCents: pricePerImage,
            });
            onImage(url);
            return { images: [url], text: "图片已生成并展示给用户" };
          }
          const url = item.url
            ? await saveRemoteGeneratedImage(userId, item.url)
            : "";
          // I7: 仅在确实拿到图片 URL 时才回调与计费，避免空结果也扣费
          if (!url) throw new Error("生图失败：上游未返回图片 URL");
          if (record) await recordReservedUsage(userId, record, null, {
            inputTokens: 0,
            outputTokens: 0,
            imageCount: 1,
            costCents: pricePerImage,
          });
          onImage(url);
          return { images: [url], text: "图片已生成并展示给用户" };
        } catch (e) {
          if (reservation) {
            await refundSpendReservation(
              userId,
              reservation,
              `${record?.displayName ?? "生图"} 失败退款`
            ).catch((err) =>
              console.error("[billing] 生图失败退款异常", err)
            );
          }
          throw e;
        }
      },
    }),
  };
}

export async function saveGeneratedImage(userId: string, b64: string): Promise<string> {
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
        if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          const { assertSafeUrl } = await import("@/lib/server/net-guard");
          await assertSafeUrl(imageUrl);
        }
        const [s] = await db
          .select({ helper: schema.settings.visionHelperModelId })
          .from(schema.settings)
          .where(eq(schema.settings.id, "global"));
        if (!s?.helper) throw new Error("管理员尚未配置辅助识图模型");
        const { model } = await resolveModel(s.helper);

        const imageSrc = await resolveImageSource(imageUrl);

        const { generateText } = await import("ai");
        const { text } = await generateText({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", image: new URL(imageSrc) },
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
        return { artifactId: id, artifactTitle: title, text: `已创建 Artifact「${title}」` };
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
        return {
          artifactId,
          artifactTitle: existing.title,
          text: `已更新 Artifact「${existing.title}」到 v${nextVersion}`,
        };
      },
    }),
  };
}

// ---------- 记忆 ----------

export function buildMemoryTools(
  userId: string,
  conversationId: string,
  projectId?: string | null
): ToolSet {
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
          projectId: projectId ?? null,
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
        const results = await searchMemories(userId, query, 5, projectId);
        if (results.length === 0) return { text: "没有找到相关记忆" };
        return { text: results.map((m, i) => `${i + 1}. ${m}`).join("\n") };
      },
    }),
  };
}

export async function searchMemories(
  userId: string,
  query: string,
  limit: number,
  projectId?: string | null
): Promise<string[]> {
  // 项目级记忆：只检索同一项目的 + 全局的（projectId=null）
  const memFilter = projectId
    ? and(
        eq(schema.memories.ownerId, userId),
        or(eq(schema.memories.projectId, projectId), isNull(schema.memories.projectId))
      )
    : and(eq(schema.memories.ownerId, userId), isNull(schema.memories.projectId));
  try {
    const { embedText } = await import("./embedding");
    const queryEmbedding = await embedText(query);
    const { cosineDistance, desc: descOp, sql: sqlOp } = await import("drizzle-orm");
    const similarity = sqlOp<number>`1 - (${cosineDistance(schema.memories.embedding, queryEmbedding)})`;
    const rows = await db
      .select({ content: schema.memories.content, similarity })
      .from(schema.memories)
      .where(memFilter)
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
          memFilter,
          ilike(schema.memories.content, `%${query.slice(0, 20)}%`)
        )
      )
      .limit(limit);
    return rows.map((r) => r.content);
  }
}

/** 开场注入：取用户最近的记忆拼进系统提示词（项目级隔离） */
export async function loadRecentMemories(
  userId: string,
  limit = 10,
  projectId?: string | null
): Promise<string[]> {
  const { desc: descOp } = await import("drizzle-orm");
  // 项目级记忆：项目内 + 全局（projectId=null）；无项目时只取全局
  const memFilter = projectId
    ? and(
        eq(schema.memories.ownerId, userId),
        or(eq(schema.memories.projectId, projectId), isNull(schema.memories.projectId))
      )
    : and(eq(schema.memories.ownerId, userId), isNull(schema.memories.projectId));
  const rows = await db
    .select({ content: schema.memories.content })
    .from(schema.memories)
    .where(memFilter)
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
              eq(schema.knowledgeBases.ownerId, userId),
              eq(schema.kbDocuments.status, "ready")
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

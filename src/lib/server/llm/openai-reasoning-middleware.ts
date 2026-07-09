import type { LanguageModelV4Middleware } from "@ai-sdk/provider";
import type { JSONObject, LanguageModelV4StreamPart } from "@ai-sdk/provider";

/**
 * 中转网关 OpenAI Chat Completions 兼容层。
 *
 * 这个网关（api.cdn-krill-ai.com）在 OpenAI Chat Completions 协议上有两处
 * 非标准行为，会直接导致 @ai-sdk/openai 解析失败、流中断：
 *
 * 1. reasoning 字段：网关用 delta.reasoning_content（DeepSeek 风格扩展）或
 *    delta.reasoning（OpenRouter 风格扩展）回传推理模型的思考过程，
 *    但 @ai-sdk/openai 的 chat model 不解析这些字段。
 *    （Responses 端点则完全不回 reasoning 事件。）
 *
 * 2. inline 图片：AI SDK 7 的 OpenAI Chat 适配器会把 inline image data 转成
 *    image_url.url = 裸 base64。官方/中转 Chat Completions 需要完整 data URL，
 *    否则视觉请求会报 image_url 格式无效。
 *
 * 3. tool_calls 畸形增量 delta：参数增量 delta 本应只含 index + function.arguments，
 *    网关却把 type/id/name 都填成空串（如 {"type":"","id":"","name":""}）。
 *    @ai-sdk/openai 的 zod schema 要求 type === "function"，空串校验失败 → 整条流
 *    抛 { type: "error" }，前端 toast 报 type validation failed。
 *
 * 两层修复：
 * - sanitizeOpenAIChatStreamFetch：在 fetch 层补齐 inline 图片 data URL，并清洗 SSE
 *   中 tool_calls 的空串字段（从源头修复，让上游与 zod 校验都通过）。
 * - openaiReasoningMiddleware：在 stream 层把 reasoning_content 桥接成标准 reasoning 事件。
 */

// ---------------------------------------------------------------------------
// 1. fetch 层：清洗 tool_calls 畸形增量 delta
// ---------------------------------------------------------------------------

type FetchLike = typeof globalThis.fetch;

/**
 * 返回一个 fetch 包装函数：对 OpenAI Chat Completions 的 SSE 响应做逐行清洗，
 * 删除 tool_calls delta 里值为空串的 type/id/name 字段。
 *
 * 网关在参数增量 delta 里会把 type/id/name 填成 ""，而 @ai-sdk/openai 的 zod
 * schema 要求 type === "function"，空串会被拒。这里删掉这些空串字段后，增量
 * delta 只剩 { index, function: { arguments } }，符合 OpenAI 标准且能通过校验。
 * 初始化 delta（type/id/name 均非空）不受影响。
 */
export function sanitizeOpenAIChatStreamFetch(baseFetch: FetchLike = fetch): FetchLike {
  return async (input, init) => {
    const res = await baseFetch(input, sanitizeChatRequestInit(init));
    // 只处理 SSE 流；非流式 JSON 响应（如错误）原样返回。
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("event-stream") || !res.body) {
      return res;
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";

    const cleaned = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          buffer += decoder.decode(chunk, { stream: true });
          // SSE 以 \n\n 分隔事件，每事件内 data: 行可能多行。逐行处理 data: 前缀的行。
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data:")) {
              const payload = line.slice(5).trim();
              if (payload && payload !== "[DONE]") {
                controller.enqueue(
                  encoder.encode("data: " + sanitizeLine(payload) + "\n")
                );
              } else {
                controller.enqueue(encoder.encode(line + "\n"));
              }
            } else {
              // 非 data 行（event:/空行/注释）原样透传，补回拆分时丢掉的 \n。
              controller.enqueue(encoder.encode(line + "\n"));
            }
          }
        },
        flush(controller) {
          buffer += decoder.decode();
          if (!buffer) return;
          const lines = buffer.split("\n");
          for (const line of lines) {
            if (line.startsWith("data:")) {
              const payload = line.slice(5).trim();
              if (payload && payload !== "[DONE]") {
                controller.enqueue(
                  encoder.encode("data: " + sanitizeLine(payload) + "\n")
                );
              } else {
                controller.enqueue(encoder.encode(line + "\n"));
              }
            } else {
              controller.enqueue(encoder.encode(line + "\n"));
            }
          }
        },
      })
    );

    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(cleaned, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}

function sanitizeChatRequestInit(init: RequestInit | undefined): RequestInit | undefined {
  if (!init || typeof init.body !== "string") return init;

  const body = sanitizeChatRequestBody(init.body);
  if (body === init.body) return init;
  return { ...init, body };
}

function sanitizeChatRequestBody(body: string) {
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    return body;
  }
  if (!obj || typeof obj !== "object") return body;
  const messages = (obj as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return body;

  let mutated = false;
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const imageUrl = (part as { image_url?: unknown }).image_url;
      if (!imageUrl || typeof imageUrl !== "object") continue;
      const current = (imageUrl as { url?: unknown }).url;
      if (typeof current !== "string") continue;
      const patched = toImageDataUrl(current);
      if (patched && patched !== current) {
        (imageUrl as { url: string }).url = patched;
        mutated = true;
      }
    }
  }

  return mutated ? JSON.stringify(obj) : body;
}

function toImageDataUrl(value: string) {
  const input = value.trim();
  if (!input || input.startsWith("data:image/") || /^https?:\/\//i.test(input)) {
    return null;
  }
  if (!/^[A-Za-z0-9+/_=-]+$/.test(input)) return null;

  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const header = Buffer.from(padded.slice(0, 64), "base64");

  let mediaType: string | null = null;
  if (
    header.length >= 8 &&
    header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    mediaType = "image/png";
  } else if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    mediaType = "image/jpeg";
  } else if (
    header.subarray(0, 6).toString("latin1") === "GIF87a" ||
    header.subarray(0, 6).toString("latin1") === "GIF89a"
  ) {
    mediaType = "image/gif";
  } else if (
    header.subarray(0, 4).toString("latin1") === "RIFF" &&
    header.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    mediaType = "image/webp";
  }

  return mediaType ? `data:${mediaType};base64,${padded}` : null;
}

/** 解析单行 SSE data 的 JSON，清洗 tool_calls 后重新序列化。无法解析则原样返回。 */
function sanitizeLine(payload: string): string {
  let obj: unknown;
  try {
    obj = JSON.parse(payload);
  } catch {
    return payload;
  }
  if (!obj || typeof obj !== "object") return payload;
  const choices = (obj as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return payload;

  let mutated = false;
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    // 流式 chunk 在 delta.tool_calls，结束 chunk 在 message.tool_calls。
    const holder =
      (choice as { delta?: unknown }).delta ?? (choice as { message?: unknown }).message;
    if (!holder || typeof holder !== "object") continue;
    const toolCalls = (holder as { tool_calls?: unknown }).tool_calls;
    if (!Array.isArray(toolCalls)) continue;
    for (const tc of toolCalls) {
      if (!tc || typeof tc !== "object") continue;
      // 删掉值为空串的 type/id/name，让增量 delta 只保留 index + function.arguments。
      // 初始化 delta 字段非空、不会触发删除。
      if ((tc as { type?: string }).type === "") {
        delete (tc as { type?: string }).type;
        mutated = true;
      }
      if ((tc as { id?: string }).id === "") {
        delete (tc as { id?: string }).id;
        mutated = true;
      }
      const fn = (tc as { function?: { name?: string } }).function;
      if (fn && fn.name === "") {
        delete fn.name;
        mutated = true;
      }
    }
  }

  return mutated ? JSON.stringify(obj) : payload;
}

// ---------------------------------------------------------------------------
// 2. stream 层：桥接 reasoning_content → 标准 reasoning 事件
// ---------------------------------------------------------------------------

/**
 * 把网关在 Chat Completions 端点返回的 delta.reasoning_content / delta.reasoning
 * 字段桥接成
 * 标准的 reasoning 流事件（reasoning-start / reasoning-delta / reasoning-end）。
 *
 * 工作方式：
 * 1. transformParams：强制开启 includeRawChunks（让底层 chat model 透出每个 SSE
 *    原始 chunk），并注入 providerOptions.openai.reasoningEffort（网关需要显式
 *    reasoning_effort 才会真正触发推理。部分网关只回传空字符串，用它作为
 *    “推理阶段存在”的信号，而不是可展示的推理摘要。
 * 2. wrapStream：拦截流，从 raw chunk 里读出 reasoning_content 增量，发标准
 *    reasoning 事件；raw chunk 本身不向下游透传（避免污染 route handler 循环）。
 */
export function openaiReasoningMiddleware(): LanguageModelV4Middleware {
  return {
    specificationVersion: "v4",

    transformParams: async ({ params }) => {
      const existingOpenai = (params.providerOptions?.openai ?? {}) as JSONObject & {
        reasoningEffort?: string;
      };
      const openai: JSONObject = { ...existingOpenai };
      if (!openai.reasoningEffort) openai.reasoningEffort = "medium";
      return {
        ...params,
        includeRawChunks: true,
        providerOptions: { ...params.providerOptions, openai },
      };
    },

    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      let isActiveReasoning = false;
      // 固定 id：一次 assistant 响应只有一个推理块，无需多 id 管理。
      const REASONING_ID = "reasoning-openai";

      return {
        stream: stream.pipeThrough(
          new TransformStream<
            LanguageModelV4StreamPart,
            LanguageModelV4StreamPart
          >({
            transform(chunk, controller) {
              // 从 raw chunk 抽取 reasoning_content 增量，转成标准 reasoning 事件。
              // raw chunk 不向下游透传。
              if (chunk.type === "raw") {
                const reasoning = extractReasoningDelta(chunk.rawValue);
                if (reasoning.present) {
                  if (!isActiveReasoning) {
                    isActiveReasoning = true;
                    controller.enqueue({
                      type: "reasoning-start",
                      id: REASONING_ID,
                    });
                  }
                  if (reasoning.delta) {
                    controller.enqueue({
                      type: "reasoning-delta",
                      id: REASONING_ID,
                      delta: reasoning.delta,
                    });
                  }
                }
                return;
              }

              if (
                isActiveReasoning &&
                (chunk.type === "text-start" ||
                  chunk.type === "text-delta" ||
                  chunk.type === "tool-input-start")
              ) {
                isActiveReasoning = false;
                controller.enqueue({
                  type: "reasoning-end",
                  id: REASONING_ID,
                });
              }

              // 其余 chunk 原样透传（text-delta / tool-* / finish / error 等）。
              controller.enqueue(chunk);
            },

            flush(controller) {
              // 流结束时若推理块仍开启，补发 reasoning-end，
              // 确保 LinHub 的 reasoning-end handler 能计算 durationMs。
              if (isActiveReasoning) {
                controller.enqueue({
                  type: "reasoning-end",
                  id: REASONING_ID,
                });
              }
            },
          })
        ),
        ...rest,
      };
    },
  };
}

/**
 * 从上游 SSE 原始 chunk（已 JSON.parse 的对象）里安全抽取 reasoning 增量。
 * 典型结构：{ choices: [{ delta: { reasoning_content: "I" } }] }
 * 非推理响应或无该字段时 present=false。
 */
function extractReasoningDelta(rawValue: unknown): {
  present: boolean;
  delta?: string;
} {
  if (!rawValue || typeof rawValue !== "object") return { present: false };
  const choices = (rawValue as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return { present: false };
  const delta = (choices[0] as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") return { present: false };
  const candidate = delta as {
    reasoning?: unknown;
    reasoning_content?: unknown;
    reasoning_summary?: unknown;
    reasoning_details?: unknown;
  };
  if ("reasoning_content" in candidate) {
    return toReasoningDelta(candidate.reasoning_content);
  }
  if ("reasoning" in candidate) {
    return toReasoningDelta(candidate.reasoning);
  }
  if ("reasoning_summary" in candidate) {
    return toReasoningDelta(candidate.reasoning_summary);
  }
  if ("reasoning_details" in candidate) {
    return toReasoningDelta(candidate.reasoning_details);
  }
  return { present: false };
}

function toReasoningDelta(content: unknown): { present: boolean; delta?: string } {
  if (typeof content === "string") {
    const cleaned = sanitizeReasoningDelta(content);
    return {
      present: true,
      delta: cleaned.length > 0 ? cleaned : undefined,
    };
  }
  if (Array.isArray(content)) {
    const text = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const record = item as {
          text?: unknown;
          summary?: unknown;
          content?: unknown;
        };
        if (typeof record.text === "string") return record.text;
        if (typeof record.summary === "string") return record.summary;
        if (typeof record.content === "string") return record.content;
        return "";
      })
      .join("");
    const cleaned = sanitizeReasoningDelta(text);
    return { present: true, delta: cleaned.length > 0 ? cleaned : undefined };
  }
  return {
    present: true,
  };
}

/** 推理摘要里偶发出现的空 HTML 注释，入库前剥掉 */
function sanitizeReasoningDelta(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

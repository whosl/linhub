import { NextRequest } from "next/server";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import {
  generateText,
  stepCountIs,
  streamText,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { db, schema } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/seed";
import { computeCostCents, resolveModel } from "@/lib/server/llm/registry";
import {
  assertCanSpend,
  assertModelAccess,
  recordUsage,
} from "@/lib/server/billing";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  buildArtifactTools,
  buildImageTools,
  buildKnowledgeTool,
  buildMcpTools,
  buildMemoryTools,
  buildVisionTool,
  buildWebTools,
  loadRecentMemories,
} from "@/lib/server/llm/tools";
import type {
  ChatToolToggles,
  ImagePart,
  Message as UiMessage,
  MessagePart,
  SendMessageInput,
  StreamEvent,
  ToolCallPart,
  ToolResultSummary,
} from "@/lib/types";

export const maxDuration = 300;

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

interface RegenerateInput {
  regenerate: true;
  conversationId: string;
  assistantMessageId: string;
  modelId?: string;
}

type ChatRequest = SendMessageInput | RegenerateInput;

export async function POST(req: NextRequest) {
  await ensureSeeded();
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const limited = rateLimit(`chat:${userId}`, 20, 60_000);
  if (limited) return limited;
  const body = (await req.json()) as ChatRequest;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        if ("regenerate" in body) {
          await handleRegenerate(body, userId, emit, req.signal);
        } else {
          await handleSend(body, userId, emit, req.signal);
        }
      } catch (e) {
        emit({
          type: "error",
          message: e instanceof Error ? e.message : "生成失败",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

/** 校验会话关联资源的归属，越权时抛错（IDOR 防护） */
async function assertOwnedRefs(
  userId: string,
  refs: { projectId?: string | null; skillId?: string | null; styleId?: string | null }
) {
  if (refs.projectId) {
    const [p] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, refs.projectId), eq(schema.projects.ownerId, userId))
      );
    if (!p) throw new Error("项目不存在");
  }
  if (refs.skillId) {
    // 自己的 skill 或已公开的 skill 可用
    const [s] = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(
        and(
          eq(schema.skills.id, refs.skillId),
          or(eq(schema.skills.ownerId, userId), eq(schema.skills.visibility, "public"))
        )
      );
    if (!s) throw new Error("技能不存在");
  }
  if (refs.styleId) {
    // 内置风格（ownerId 为空）或自己的风格可用
    const [st] = await db
      .select({ id: schema.styles.id })
      .from(schema.styles)
      .where(
        and(
          eq(schema.styles.id, refs.styleId),
          or(isNull(schema.styles.ownerId), eq(schema.styles.ownerId, userId))
        )
      );
    if (!st) throw new Error("回复风格不存在");
  }
}

async function handleSend(
  input: SendMessageInput,
  userId: string,
  emit: (e: StreamEvent) => void,
  signal: AbortSignal
) {
  // 1. 会话
  let conversationId = input.conversationId;
  let isNew = false;
  if (!conversationId) {
    conversationId = `c-${uid()}`;
    isNew = true;
    await assertOwnedRefs(userId, input);
    await db.insert(schema.conversations).values({
      id: conversationId,
      ownerId: userId,
      modelId: input.modelId,
      projectId: input.projectId,
      skillId: input.skillId,
      styleId: input.styleId,
    });
    if (input.skillId) {
      await db
        .update(schema.skills)
        .set({ usageCount: sql`${schema.skills.usageCount} + 1` })
        .where(eq(schema.skills.id, input.skillId));
    }
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
    emit({
      type: "conversation-created",
      conversation: toUiConversation(conversation),
    });
  } else {
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.ownerId, userId)
        )
      );
    if (!conversation) throw new Error("会话不存在");
  }

  // 2. 父消息（分支）
  let parentId: string | null;
  if (input.parentId !== undefined) {
    parentId = input.parentId;
  } else {
    const [conversation] = await db
      .select({ leaf: schema.conversations.currentLeafId })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
    parentId = conversation?.leaf ?? null;
  }

  // 3. 落库用户消息
  const userParts: MessagePart[] = [
    ...(input.images ?? []),
    ...(input.attachments ?? []),
    { type: "text", text: input.text },
  ];
  const userMessageId = `msg-${uid()}`;
  await db.insert(schema.messages).values({
    id: userMessageId,
    conversationId,
    parentId,
    role: "user",
    parts: userParts,
    quotedText: input.quotedText,
    status: "complete",
  });
  emit({
    type: "user-message",
    message: {
      id: userMessageId,
      conversationId,
      parentId,
      role: "user",
      parts: userParts,
      quotedText: input.quotedText,
      createdAt: new Date().toISOString(),
      status: "complete",
    },
  });

  // 4. 流式生成
  await streamAssistant({
    conversationId,
    parentId: userMessageId,
    modelId: input.modelId,
    styleId: input.styleId,
    extendedThinking: input.extendedThinking,
    toolToggles: input.tools,
    userId,
    emit,
    signal,
  });

  // 5. 新会话自动标题
  if (isNew) {
    try {
      const { model } = await resolveModel(input.modelId);
      const { text } = await generateText({
        model,
        prompt: `用不超过 15 个字为这段对话起一个标题，直接输出标题本身，不要引号和标点：\n\n${input.text.slice(0, 500)}`,
      });
      const title = text.trim().slice(0, 30) || input.text.slice(0, 20);
      await db
        .update(schema.conversations)
        .set({ title })
        .where(eq(schema.conversations.id, conversationId));
      emit({ type: "title", conversationId, title });
    } catch {
      const title = input.text.slice(0, 20) || "新对话";
      await db
        .update(schema.conversations)
        .set({ title })
        .where(eq(schema.conversations.id, conversationId));
      emit({ type: "title", conversationId, title });
    }
  }
}

async function handleRegenerate(
  input: RegenerateInput,
  userId: string,
  emit: (e: StreamEvent) => void,
  signal: AbortSignal
) {
  const [target] = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, input.assistantMessageId));
  if (!target?.parentId) throw new Error("消息不存在");
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, input.conversationId),
        eq(schema.conversations.ownerId, userId)
      )
    );
  if (!conversation) throw new Error("会话不存在");

  await streamAssistant({
    conversationId: input.conversationId,
    parentId: target.parentId,
    modelId: input.modelId ?? target.modelId ?? conversation.modelId,
    styleId: conversation.styleId ?? undefined,
    extendedThinking: true,
    userId,
    emit,
    signal,
  });
}

async function streamAssistant(opts: {
  conversationId: string;
  parentId: string;
  modelId: string;
  styleId?: string;
  extendedThinking: boolean;
  toolToggles?: ChatToolToggles;
  userId: string;
  emit: (e: StreamEvent) => void;
  signal: AbortSignal;
}) {
  const { conversationId, parentId, modelId, userId, emit, signal } = opts;

  const assistantId = `msg-${uid()}`;
  emit({
    type: "assistant-start",
    message: {
      id: assistantId,
      conversationId,
      parentId,
      role: "assistant",
      modelId,
      parts: [],
      createdAt: new Date().toISOString(),
      status: "streaming",
    },
  });

  // 历史消息链（从 parentId 向上回溯）
  const all = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId));
  const byId = new Map(all.map((m) => [m.id, m]));
  const chain: (typeof all)[number][] = [];
  let cursor = byId.get(parentId);
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  let modelHasVision = false;
  try {
    const { record: modelRecord } = await resolveModel(modelId);
    modelHasVision = (modelRecord.capabilities as string[]).includes("vision");
  } catch {
    // 供应商未配置等错误在下方 streamText 的 try 中统一处理
  }

  const history: ModelMessage[] = [];
  for (const m of chain) {
    if (m.role === "system") continue;
    const msgParts = m.parts as MessagePart[];
    let text = msgParts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (m.quotedText) text = `> ${m.quotedText}\n\n${text}`;

    // 文件附件：注入抽取文本
    const fileParts = msgParts.filter((p) => p.type === "file");
    for (const f of fileParts) {
      const [att] = await db
        .select({ text: schema.attachments.extractedText, name: schema.attachments.name })
        .from(schema.attachments)
        .where(
          and(
            eq(schema.attachments.id, f.attachmentId),
            eq(schema.attachments.ownerId, userId)
          )
        );
      if (att?.text) {
        text += `\n\n<attached_file name="${att.name}">\n${att.text.slice(0, 30_000)}\n</attached_file>`;
      } else {
        text += `\n\n（用户上传了文件「${f.name}」，内容无法解析）`;
      }
    }

    const imageParts = msgParts.filter((p): p is ImagePart => p.type === "image");
    if (m.role === "user" && imageParts.length > 0) {
      const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
      if (modelHasVision) {
        history.push({
          role: "user",
          content: [
            ...imageParts.map((img) => ({
              type: "image" as const,
              image: new URL(img.url.startsWith("http") ? img.url : origin + img.url),
            })),
            { type: "text" as const, text: text || "请看这张图片。" },
          ],
        });
      } else {
        // 无视觉能力：提示模型调用 analyze_image 工具
        const urls = imageParts
          .map((img) => (img.url.startsWith("http") ? img.url : origin + img.url))
          .join("\n");
        history.push({
          role: "user",
          content: `${text}\n\n（用户上传了图片，你无法直接查看。请调用 analyze_image 工具分析，图片 URL：\n${urls}）`,
        });
      }
      continue;
    }

    if (text.trim().length > 0) {
      history.push({ role: m.role as "user" | "assistant", content: text });
    }
  }

  // 系统提示词：站点身份 + 风格 + Skill + 项目指令 + 记忆
  let system = "你是 LinHub，一个乐于助人的中文 AI 助手。使用 Markdown 格式回答。";
  if (opts.styleId) {
    const [style] = await db
      .select()
      .from(schema.styles)
      .where(eq(schema.styles.id, opts.styleId));
    if (style?.prompt) system += `\n\n回复风格要求：${style.prompt}`;
  }

  const [conv] = await db
    .select({ projectId: schema.conversations.projectId, skillId: schema.conversations.skillId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId));

  // Skill：系统提示词覆盖
  if (conv?.skillId) {
    const [skill] = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, conv.skillId));
    if (skill) {
      system = `${skill.systemPrompt}\n\n（你运行在 LinHub 平台上，使用 Markdown 格式回答。）`;
    }
  }

  // 项目：自定义指令 + 项目文件
  if (conv?.projectId) {
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, conv.projectId));
    if (project?.instructions) {
      system += `\n\n本会话属于项目「${project.name}」，项目指令：\n${project.instructions}`;
    }
    const projectFiles = await db
      .select({ name: schema.attachments.name, text: schema.attachments.extractedText })
      .from(schema.attachments)
      .where(eq(schema.attachments.projectId, conv.projectId));
    const withText = projectFiles.filter((f) => f.text);
    if (withText.length > 0) {
      system +=
        "\n\n项目文件内容：\n" +
        withText
          .map((f) => `<project_file name="${f.name}">\n${f.text!.slice(0, 15_000)}\n</project_file>`)
          .join("\n");
    }
  }

  // 记忆注入
  try {
    const memories = await loadRecentMemories(userId);
    if (memories.length > 0) {
      system += `\n\n关于用户的已知信息（长期记忆）：\n${memories.map((m) => `- ${m}`).join("\n")}`;
    }
  } catch {
    // 记忆读取失败不阻塞
  }

  const parts: MessagePart[] = [];
  let usage = { inputTokens: 0, outputTokens: 0, costCents: 0 };
  let status: UiMessage["status"] = "complete";

  // 工具集：根据会话开关组装
  const toggles = opts.toolToggles;
  const pendingImages: string[] = [];
  let tools: ToolSet = {};
  let closeMcp: (() => Promise<void>) | undefined;
  if (toggles?.webSearch) Object.assign(tools, buildWebTools());
  if (toggles?.imageGeneration)
    Object.assign(
      tools,
      buildImageTools(userId, (url) => pendingImages.push(url))
    );
  Object.assign(tools, buildVisionTool());
  Object.assign(tools, buildArtifactTools(conversationId));
  Object.assign(tools, buildMemoryTools(userId, conversationId));
  Object.assign(tools, buildKnowledgeTool(userId, toggles?.knowledgeBaseIds ?? []));
  try {
    const mcp = await buildMcpTools(userId, toggles?.mcpServerIds ?? []);
    Object.assign(tools, mcp.tools);
    closeMcp = mcp.close;
  } catch {
    // MCP 初始化失败不阻塞聊天
  }
  const hasTools = Object.keys(tools).length > 0;

  let streamResult: ReturnType<typeof streamText> | undefined;

  try {
    const { model, record, provider, storeEnabled } = await resolveModel(modelId);
    // Pro 模型需订阅（C8）；余额/额度预检防透支（C2）
    await assertModelAccess(userId, record);
    await assertCanSpend(userId);
    const supportsTools = (record.capabilities as string[]).includes("tools");
    if (!supportsTools) tools = {};
    const result = streamText({
      model,
      system,
      messages: history,
      abortSignal: signal,
      ...(record.maxOutputTokens ? { maxOutputTokens: record.maxOutputTokens } : {}),
      ...(hasTools && supportsTools
        ? { tools, stopWhen: stepCountIs(8) }
        : {}),
      // 走中转网关的 OpenAI Responses API 常不持久化 reasoning item，
      // 关闭 store 后多步工具循环不会再以 item_reference 引用上一轮的 rs_xxx
      ...(!storeEnabled && provider.kind === "openai"
        ? { providerOptions: { openai: { store: false } } }
        : {}),
    });
    streamResult = result;

    let reasoningStart = 0;
    const toolParts = new Map<string, ToolCallPart>();
    for await (const chunk of result.fullStream) {
      if (chunk.type === "reasoning-start") {
        reasoningStart = Date.now();
      } else if (chunk.type === "reasoning-delta") {
        appendDelta(parts, "reasoning", chunk.text);
        emit({ type: "reasoning-delta", messageId: assistantId, delta: chunk.text });
      } else if (chunk.type === "reasoning-end") {
        const duration = Date.now() - reasoningStart;
        const last = parts[parts.length - 1];
        if (last?.type === "reasoning") last.durationMs = duration;
        emit({ type: "reasoning-done", messageId: assistantId, durationMs: duration });
      } else if (chunk.type === "text-delta") {
        appendDelta(parts, "text", chunk.text);
        emit({ type: "text-delta", messageId: assistantId, delta: chunk.text });
      } else if (chunk.type === "tool-call") {
        const part: ToolCallPart = {
          type: "tool-call",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName as ToolCallPart["toolName"],
          args: (chunk.input ?? {}) as Record<string, unknown>,
          state: "running",
        };
        toolParts.set(chunk.toolCallId, part);
        parts.push(part);
        emit({ type: "tool-call-start", messageId: assistantId, part });
      } else if (chunk.type === "tool-result") {
        const part = toolParts.get(chunk.toolCallId);
        if (part) {
          part.state = "success";
          part.result = summarizeToolResult(chunk.output);
          emit({ type: "tool-call-end", messageId: assistantId, part });
          // 生图工具产出的图片作为独立 part 展示
          while (pendingImages.length > 0) {
            const url = pendingImages.shift()!;
            const imagePart: ImagePart = { type: "image", url, alt: "生成的图片" };
            parts.push(imagePart);
            emit({ type: "image", messageId: assistantId, part: imagePart });
          }
        }
      } else if (chunk.type === "tool-error") {
        const part = toolParts.get(chunk.toolCallId);
        if (part) {
          part.state = "error";
          part.errorMessage =
            chunk.error instanceof Error ? chunk.error.message : String(chunk.error);
          emit({ type: "tool-call-end", messageId: assistantId, part });
        }
      } else if (chunk.type === "error") {
        throw chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error));
      }
    }

    const finalUsage = await result.usage;
    const inputTokens = finalUsage.inputTokens ?? 0;
    const outputTokens = finalUsage.outputTokens ?? 0;
    usage = {
      inputTokens,
      outputTokens,
      costCents: computeCostCents(record, { inputTokens, outputTokens }),
    };

    // 计费落库
    await recordUsage(userId, record, conversationId, usage);
    await closeMcp?.();
  } catch (e) {
    await closeMcp?.();
    if (signal.aborted || (e instanceof Error && e.name === "AbortError")) {
      status = "stopped";
      // 中止也要为已产生的 token 计费（C3：防逃单）
      try {
        const { record } = await resolveModel(modelId);
        // 优先取 SDK 真实用量（限 2s，abort 后可能拿不到）；否则按字符数估算
        let inputTokens = 0;
        let outputTokens = 0;
        try {
          const real = await Promise.race([
            streamResult?.usage,
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000)),
          ]);
          inputTokens = real?.inputTokens ?? 0;
          outputTokens = real?.outputTokens ?? 0;
        } catch {
          const historyChars = history.reduce(
            (n, m) => n + (typeof m.content === "string" ? m.content.length : 500),
            system.length
          );
          const outputChars = parts.reduce(
            (n, p) => n + ("text" in p && typeof p.text === "string" ? p.text.length : 0),
            0
          );
          inputTokens = Math.ceil(historyChars / 4);
          outputTokens = Math.ceil(outputChars / 4);
        }
        if (inputTokens > 0 || outputTokens > 0) {
          usage = {
            inputTokens,
            outputTokens,
            costCents: computeCostCents(record, { inputTokens, outputTokens }),
          };
          await recordUsage(userId, record, conversationId, usage);
        }
      } catch {
        // 中止计费失败不阻塞消息落库
      }
    } else {
      status = "error";
      const msg = e instanceof Error ? e.message : "生成失败";
      const isBilling = e instanceof Error && e.name === "BillingError";
      appendDelta(
        parts,
        "text",
        parts.length === 0 && !isBilling
          ? `⚠️ ${msg}\n\n请联系管理员在「管理后台 → 供应商」中检查该模型的 API Key 配置。`
          : `${parts.length === 0 ? "" : "\n\n"}⚠️ ${msg}`
      );
      emit({
        type: "text-delta",
        messageId: assistantId,
        delta: `⚠️ ${msg}`,
      });
    }
  }

  await db.insert(schema.messages).values({
    id: assistantId,
    conversationId,
    parentId,
    role: "assistant",
    modelId,
    parts,
    status,
    usage: usage.inputTokens > 0 ? usage : undefined,
  });
  await db
    .update(schema.conversations)
    .set({ currentLeafId: assistantId, updatedAt: new Date() })
    .where(eq(schema.conversations.id, conversationId));

  emit({
    type: "done",
    messageId: assistantId,
    usage: usage.inputTokens > 0 ? usage : undefined,
    status,
  });
}

function summarizeToolResult(output: unknown): ToolResultSummary {
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    const summary: ToolResultSummary = {};
    if (Array.isArray(o.sources)) summary.sources = o.sources as ToolResultSummary["sources"];
    if (Array.isArray(o.images)) summary.images = o.images as string[];
    if (typeof o.artifactId === "string") summary.artifactId = o.artifactId;
    if (typeof o.answer === "string") summary.text = o.answer;
    else if (typeof o.text === "string") summary.text = o.text.slice(0, 500);
    if (Object.keys(summary).length > 0) return summary;
    return { text: JSON.stringify(output).slice(0, 500) };
  }
  return { text: String(output).slice(0, 500) };
}

function appendDelta(
  parts: MessagePart[],
  type: "text" | "reasoning",
  delta: string
) {
  const last = parts[parts.length - 1];
  if (last && last.type === type) {
    last.text += delta;
  } else {
    parts.push({ type, text: delta } as MessagePart);
  }
}

function toUiConversation(c: typeof schema.conversations.$inferSelect) {
  return {
    id: c.id,
    title: c.title,
    projectId: c.projectId ?? undefined,
    skillId: c.skillId ?? undefined,
    modelId: c.modelId,
    styleId: c.styleId ?? undefined,
    pinned: c.pinned,
    archived: c.archived,
    currentLeafId: c.currentLeafId ?? undefined,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

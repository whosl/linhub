import type { AdminService, DataService, ProjectPatch } from "@/lib/data/service";
import type {
  AppSettings,
  Artifact,
  ChatStyle,
  Conversation,
  EngineTestInput,
  EngineTestResult,
  KnowledgeBase,
  KnowledgeDocument,
  LedgerEntry,
  McpServer,
  MediaAsset,
  MemoryEntry,
  Message,
  Model,
  Order,
  Plan,
  Project,
  ProjectFile,
  Provider,
  RemoteModel,
  Skill,
  SendMessageInput,
  StreamEvent,
  UsageRecord,
  User,
} from "@/lib/types";
import { getMockDataService } from "@/lib/data/mock/mock-service";

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 20_000
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const upstreamSignal = init?.signal;
  const abortFromCaller = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `请求失败（${res.status}）`);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    if (timedOut) throw new Error("请求超时，请检查服务器连接");
    throw e;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage = "请求超时，请稍后重试"
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (timedOut) throw new Error(timeoutMessage);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 解析 NDJSON 流为 StreamEvent */
async function* streamNdjson(
  res: Response,
  signal?: AbortSignal
): AsyncIterable<StreamEvent> {
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    yield { type: "error", message: body?.error ?? `请求失败（${res.status}）` };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parseLine = (line: string): StreamEvent => {
    try {
      return JSON.parse(line) as StreamEvent;
    } catch {
      return { type: "error", message: "流式响应解析失败，请重试" };
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          const evt = parseLine(line);
          yield evt;
          if (evt.type === "error") return;
        }
      }
    }
    if (buffer.trim()) {
      yield parseLine(buffer);
    }
  } finally {
    if (signal?.aborted) reader.cancel().catch(() => {});
  }
}

/**
 * 真实 API 数据服务。
 * 已接真：用户 / 模型 / 风格 / 会话 / 聊天流式。
 * 其余模块暂委托 Mock，按里程碑逐个替换。
 */
export class ApiDataService implements DataService {
  private mock = getMockDataService();
  private abortControllers = new Map<string, Set<AbortController>>();
  private startingConversationId: string | null = null;
  private startingGenerationId: string | null = null;

  private addAbortController(key: string, controller: AbortController) {
    const controllers = this.abortControllers.get(key) ?? new Set();
    controllers.add(controller);
    this.abortControllers.set(key, controllers);
  }

  private removeAbortController(key: string, controller: AbortController) {
    const controllers = this.abortControllers.get(key);
    if (!controllers) return;
    controllers.delete(controller);
    if (controllers.size === 0) this.abortControllers.delete(key);
  }

  private abortControllersForKey(key: string) {
    const controllers = this.abortControllers.get(key);
    if (!controllers) return;
    for (const controller of controllers) controller.abort();
    this.abortControllers.delete(key);
  }

  // ---- 用户 ----
  async getCurrentUser(): Promise<User | null> {
    return fetchJson<User | null>("/api/me", undefined, 8_000);
  }
  async updateProfile(patch: {
    name?: string;
    avatarUrl?: string;
    defaultModelId?: string | null;
  }) {
    return fetchJson<User>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  // ---- 模型与风格 ----
  listModels() {
    return fetchJson<{ models: Model[]; defaultModelId?: string }>("/api/models").then(
      (r) => r.models
    );
  }
  listModelsWithDefault() {
    return fetchJson<{ models: Model[]; defaultModelId?: string }>("/api/models");
  }
  listStyles() {
    return fetchJson<ChatStyle[]>("/api/styles");
  }
  async saveStyle(style: Partial<ChatStyle> & { name: string }) {
    return fetchJson<ChatStyle>("/api/styles", {
      method: "POST",
      body: JSON.stringify(style),
    });
  }
  async deleteStyle(id: string) {
    await fetchJson(`/api/styles/${id}`, { method: "DELETE" });
  }

  // ---- 会话 ----
  listConversations() {
    return fetchJson<Conversation[]>("/api/conversations");
  }
  async getConversation(id: string) {
    const data = await fetchJson<{ conversation: Conversation } | null>(
      `/api/conversations/${id}`
    ).catch(() => null);
    return data?.conversation ?? null;
  }
  async listMessages(conversationId: string) {
    const data = await fetchJson<{ messages: Message[] }>(
      `/api/conversations/${conversationId}`
    );
    return data.messages;
  }
  async updateConversation(
    id: string,
    patch: Parameters<DataService["updateConversation"]>[1]
  ) {
    await fetchJson(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return (await this.getConversation(id))!;
  }
  async deleteConversation(id: string) {
    void this.stopGeneration(id).catch(() => null);
    await fetchJson(`/api/conversations/${id}`, { method: "DELETE" });
  }
  listConversationsSearch(query: string) {
    return fetchJson<Conversation[]>(
      `/api/conversations?q=${encodeURIComponent(query)}`
    );
  }
  searchConversations(query: string) {
    return this.listConversationsSearch(query);
  }

  // ---- 聊天 ----
  async *sendMessage(input: SendMessageInput): AsyncIterable<StreamEvent> {
    const controller = new AbortController();
    // I11: 新会话首条响应期间 conversationId 尚未知，用一个固定哨兵键登记
    // abort controller，使 stop 按钮在拿到 conversation-created 前也能生效。
    const isNew = !input.conversationId;
    const sentinel = "__new_conversation__";
    const clientGenerationId =
      input.clientGenerationId ??
      `cg-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const payload = { ...input, clientGenerationId };
    let activeKey = input.conversationId ?? sentinel;
    if (input.conversationId) {
      this.addAbortController(input.conversationId, controller);
    } else {
      this.addAbortController(sentinel, controller);
      this.startingGenerationId = clientGenerationId;
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      for await (const event of streamNdjson(res, controller.signal)) {
        if (event.type === "conversation-created") {
          // I11: 新会话在路由跳转完成前，停止按钮仍会调用 stop(undefined)。
          // 因此哨兵键保留到 finally，再同时登记真实 id。
          this.addAbortController(event.conversation.id, controller);
          this.startingConversationId = event.conversation.id;
          activeKey = event.conversation.id;
        }
        yield event;
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        yield {
          type: "error",
          message: e instanceof Error ? e.message : "连接中断",
        };
      }
    } finally {
      this.removeAbortController(activeKey, controller);
      if (isNew) this.removeAbortController(sentinel, controller);
      if (isNew) this.startingConversationId = null;
      if (isNew && this.startingGenerationId === clientGenerationId) {
        this.startingGenerationId = null;
      }
    }
  }

  async *streamConversation(conversationId: string): AsyncIterable<StreamEvent> {
    const controller = new AbortController();
    this.addAbortController(conversationId, controller);
    try {
      const res = await fetch(
        `/api/chat?conversationId=${encodeURIComponent(conversationId)}`,
        { signal: controller.signal }
      );
      yield* streamNdjson(res, controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) {
        yield {
          type: "error",
          message: e instanceof Error ? e.message : "连接中断",
        };
      }
    } finally {
      this.removeAbortController(conversationId, controller);
    }
  }

  async stopGeneration(conversationId?: string) {
    // I11: conversationId 为空时停止新会话的 in-flight 流
    const key = conversationId ?? this.startingConversationId ?? "__new_conversation__";
    const serverConversationId = conversationId ?? this.startingConversationId;
    this.abortControllersForKey(key);
    if (!conversationId) {
      this.abortControllersForKey("__new_conversation__");
    }
    try {
      if (serverConversationId) {
        await fetchJson(
          `/api/chat?conversationId=${encodeURIComponent(serverConversationId)}`,
          { method: "DELETE" },
          8_000
        );
      } else if (this.startingGenerationId) {
        await fetchJson(
          `/api/chat?clientGenerationId=${encodeURIComponent(this.startingGenerationId)}`,
          { method: "DELETE" },
          8_000
        );
      }
    } catch (e) {
      console.warn("停止服务端生成失败，已先在本地停止流", e);
    }
    if (!conversationId) {
      this.startingConversationId = null;
      this.startingGenerationId = null;
    }
  }

  async *regenerate(
    conversationId: string,
    assistantMessageId: string,
    modelId?: string
  ): AsyncIterable<StreamEvent> {
    const controller = new AbortController();
    const clientGenerationId = `cg-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    this.addAbortController(conversationId, controller);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regenerate: true,
          clientGenerationId,
          conversationId,
          assistantMessageId,
          modelId,
        }),
        signal: controller.signal,
      });
      yield* streamNdjson(res, controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) {
        yield {
          type: "error",
          message: e instanceof Error ? e.message : "连接中断",
        };
      }
    } finally {
      this.removeAbortController(conversationId, controller);
    }
  }

  async setFeedback(messageId: string, feedback: "up" | "down" | null) {
    await fetchJson(`/api/messages/${messageId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    });
  }
  async replaceMessageImage(
    messageId: string,
    oldUrl: string,
    newUrl: string,
    editPrompt?: string
  ) {
    await fetchJson(`/api/messages/${messageId}/image`, {
      method: "PATCH",
      body: JSON.stringify({ oldUrl, newUrl, editPrompt }),
    });
  }
  async editImage(input: { image: string; mask?: string | null; prompt: string }) {
    return fetchJson<{ url: string }>(
      "/api/edit-image",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      190_000
    );
  }

  // ---- 以下模块暂委托 Mock，按里程碑接真 ----
  // ---- Artifacts（已接真） ----
  listArtifacts(conversationId: string) {
    return fetchJson<Artifact[]>(
      `/api/artifacts?conversationId=${encodeURIComponent(conversationId)}`
    );
  }
  async getArtifact(id: string) {
    try {
      return await fetchJson<Artifact>(`/api/artifacts/${id}`);
    } catch {
      return null;
    }
  }
  shareArtifact(id: string) {
    return fetchJson<{ shareToken: string }>(`/api/artifacts/${id}/share`, {
      method: "POST",
    });
  }
  // ---- Projects（已接真） ----
  listProjects() {
    return fetchJson<Project[]>("/api/projects");
  }
  async getProject(id: string) {
    try {
      return await fetchJson<Project>(`/api/projects/${id}`);
    } catch {
      return null;
    }
  }
  saveProject(p: Partial<Project> & { name: string }) {
    return fetchJson<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(p),
    });
  }
  updateProject(id: string, patch: ProjectPatch) {
    return fetchJson<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }
  async deleteProject(id: string) {
    await fetchJson(`/api/projects/${id}`, { method: "DELETE" });
  }
  listProjectConversations(projectId: string) {
    return fetchJson<Conversation[]>(`/api/projects/${projectId}/conversations`);
  }
  async uploadProjectFile(projectId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("projectId", projectId);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "上传失败");
    }
    const data = (await res.json()) as ProjectFile;
    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType || file.type || "application/octet-stream",
      size: data.size,
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
  }
  async deleteProjectFile(fileId: string) {
    await fetchJson(`/api/attachments/${fileId}`, { method: "DELETE" });
  }

  // ---- 记忆（已接真） ----
  listMemories() {
    return fetchJson<MemoryEntry[]>("/api/memories");
  }
  saveMemory(entry: Partial<MemoryEntry> & { content: string }) {
    return fetchJson<MemoryEntry>("/api/memories", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  }
  async deleteMemory(id: string) {
    await fetchJson(`/api/memories/${id}`, { method: "DELETE" });
  }

  // ---- 知识库（已接真） ----
  listKnowledgeBases() {
    return fetchJson<KnowledgeBase[]>("/api/knowledge");
  }
  saveKnowledgeBase(kb: Partial<KnowledgeBase> & { name: string }) {
    return fetchJson<KnowledgeBase>("/api/knowledge", {
      method: "POST",
      body: JSON.stringify(kb),
    });
  }
  async deleteKnowledgeBase(id: string) {
    await fetchJson(`/api/knowledge/${id}`, { method: "DELETE" });
  }
  listDocuments(kbId: string) {
    return fetchJson<KnowledgeDocument[]>(`/api/knowledge/${kbId}/documents`);
  }
  async uploadDocument(kbId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/knowledge/${kbId}/documents`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "上传失败");
    }
    const doc = (await res.json()) as KnowledgeDocument & { error?: string };
    if (doc.error) throw new Error(doc.error);
    return doc;
  }
  async deleteDocument(kbId: string, docId: string) {
    await fetchJson(`/api/knowledge/${kbId}/documents/${docId}`, {
      method: "DELETE",
    });
  }
  // ---- Skills（已接真） ----
  listMySkills() {
    return fetchJson<Skill[]>("/api/skills");
  }
  listMarketSkills() {
    return fetchJson<Skill[]>("/api/skills?market=1");
  }
  async getSkill(id: string) {
    try {
      return await fetchJson<Skill>(`/api/skills/${id}`);
    } catch {
      return null;
    }
  }
  saveSkill(s: Partial<Skill> & { name: string; shareToMarket?: boolean }) {
    return fetchJson<Skill>("/api/skills", {
      method: "POST",
      body: JSON.stringify(s),
    });
  }
  async deleteSkill(id: string) {
    await fetchJson(`/api/skills/${id}`, { method: "DELETE" });
  }

  // ---- 文件 / 媒体 ----
  listMediaAssets(opts?: {
    kind?: "upload" | "generated" | "edited" | "all";
    q?: string;
    cursor?: string;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (opts?.kind && opts.kind !== "all") params.set("kind", opts.kind);
    if (opts?.q) params.set("q", opts.q);
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return fetchJson<{ items: MediaAsset[]; nextCursor?: string }>(
      `/api/media${qs ? `?${qs}` : ""}`
    );
  }
  async deleteMediaAsset(id: string) {
    await fetchJson(`/api/media/${id}`, { method: "DELETE" });
  }

  // ---- MCP（已接真） ----
  listMcpServers(scope: "global" | "user") {
    return fetchJson<McpServer[]>(`/api/mcp?scope=${scope}`);
  }
  saveMcpServer(s: Partial<McpServer> & { name: string; url: string }) {
    return fetchJson<McpServer>("/api/mcp", {
      method: "POST",
      body: JSON.stringify(s),
    });
  }
  async deleteMcpServer(id: string) {
    await fetchJson(`/api/mcp/${id}`, { method: "DELETE" });
  }
  testMcpServer(id: string) {
    return fetchJson<{ ok: boolean; tools: McpServer["tools"]; error?: string }>(
      `/api/mcp/${id}/test`,
      { method: "POST" }
    );
  }
  // ---- 语音（MiMo，已接真） ----
  async transcribeAudio(audio: Blob): Promise<{ text: string }> {
    const form = new FormData();
    const filename =
      audio.type === "audio/wav" || audio.type === "audio/x-wav"
        ? "recording.wav"
        : audio.type === "audio/mpeg" || audio.type === "audio/mp3"
          ? "recording.mp3"
          : "recording.webm";
    form.append("audio", audio, filename);
    const res = await fetchWithTimeout(
      "/api/voice/transcribe",
      {
        method: "POST",
        body: form,
      },
      70_000,
      "语音转写超时，请稍后重试"
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "语音转写失败");
    }
    return res.json() as Promise<{ text: string }>;
  }
  async synthesizeSpeech(text: string): Promise<{ audioUrl: string }> {
    const res = await fetchWithTimeout(
      "/api/voice/tts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
      55_000,
      "语音合成超时，请稍后重试"
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "语音合成失败");
    }
    const blob = await res.blob();
    return { audioUrl: URL.createObjectURL(blob) };
  }

  listPlans() {
    return fetchJson<Plan[]>("/api/plans");
  }
  createOrder(input: { kind: Order["kind"]; amountCents?: number; planId?: string }) {
    return fetchJson<Order>("/api/orders", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  redeemCode(code: string) {
    return fetchJson<{ amountCents: number }>("/api/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  // ---- 计费（已接真） ----
  listUsageRecords() {
    return fetchJson<UsageRecord[]>("/api/usage");
  }
  listLedger() {
    return fetchJson<LedgerEntry[]>("/api/ledger");
  }

  admin: AdminService = new ApiAdminService(this.mock.admin);
}

/** 管理端：供应商/模型/设置/用户已接真，其余暂委托 Mock */
class ApiAdminService implements AdminService {
  constructor(private mockAdmin: AdminService) {}

  listProviders() {
    return fetchJson<Provider[]>("/api/admin/providers");
  }
  saveProvider(p: Parameters<AdminService["saveProvider"]>[0]) {
    return fetchJson<Provider>("/api/admin/providers", {
      method: "POST",
      body: JSON.stringify(p),
    });
  }
  async deleteProvider(id: string) {
    await fetchJson(`/api/admin/providers/${id}`, { method: "DELETE" });
  }
  listAllModels() {
    return fetchJson<Model[]>("/api/admin/models");
  }
  saveModel(m: Parameters<AdminService["saveModel"]>[0]) {
    return fetchJson<Model>("/api/admin/models", {
      method: "POST",
      body: JSON.stringify(m),
    });
  }
  async deleteModel(id: string) {
    await fetchJson(`/api/admin/models/${id}`, { method: "DELETE" });
  }
  listRemoteModels(providerId: string) {
    return fetchJson<RemoteModel[]>(`/api/admin/providers/${providerId}/models`);
  }
  addRemoteModels(providerId: string, slugs: string[]) {
    return fetchJson<{ added: number }>(`/api/admin/providers/${providerId}/models`, {
      method: "POST",
      body: JSON.stringify({ slugs }),
    });
  }
  getSettings() {
    return fetchJson<AppSettings>("/api/admin/settings");
  }
  saveSettings(patch: Parameters<AdminService["saveSettings"]>[0]) {
    return fetchJson<AppSettings>("/api/admin/settings", {
      method: "POST",
      body: JSON.stringify(patch),
    });
  }
  testEngineConnection(input: EngineTestInput) {
    return fetchJson<EngineTestResult>(
      "/api/admin/settings/engine-test",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      input.engine === "image" ? 130_000 : 70_000
    );
  }
  listUsers() {
    return fetchJson<User[]>("/api/admin/users");
  }
  async grantBalance(userId: string, amountCents: number, note?: string) {
    await fetchJson("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ userId, amountCents, note }),
    });
  }
  listAllUsage() {
    return fetchJson<UsageRecord[]>("/api/usage?all=1");
  }

  listPendingSkills() {
    return fetchJson<Skill[]>("/api/admin/skills");
  }
  async reviewSkill(id: string, approve: boolean) {
    await fetchJson("/api/admin/skills", {
      method: "POST",
      body: JSON.stringify({ id, approve }),
    });
  }

  listAllPlans() {
    return fetchJson<Plan[]>("/api/admin/plans");
  }
  savePlan(p: Parameters<AdminService["savePlan"]>[0]) {
    return fetchJson<Plan>("/api/admin/plans", {
      method: "POST",
      body: JSON.stringify(p),
    });
  }
  async deletePlan(id: string) {
    await fetchJson(`/api/admin/plans?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }
}

let instance: ApiDataService | null = null;
export function getApiDataService(): ApiDataService {
  instance ??= new ApiDataService();
  return instance;
}

import type { AdminService, DataService } from "@/lib/data/service";
import type {
  AppSettings,
  Artifact,
  ChatStyle,
  Conversation,
  KnowledgeBase,
  KnowledgeDocument,
  LedgerEntry,
  McpServer,
  MemoryEntry,
  Message,
  Model,
  Order,
  Plan,
  Project,
  Provider,
  Skill,
  SendMessageInput,
  StreamEvent,
  UsageRecord,
  User,
} from "@/lib/types";
import { getMockDataService } from "@/lib/data/mock/mock-service";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
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
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line) as StreamEvent;
      }
    }
    if (buffer.trim()) yield JSON.parse(buffer) as StreamEvent;
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
  private abortControllers = new Map<string, AbortController>();

  // ---- 用户 ----
  async getCurrentUser(): Promise<User | null> {
    return fetchJson<User | null>("/api/me");
  }
  async updateProfile(patch: { name?: string; avatarUrl?: string }) {
    return fetchJson<User>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  // ---- 模型与风格 ----
  listModels() {
    return fetchJson<Model[]>("/api/models");
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
    if (input.conversationId)
      this.abortControllers.set(input.conversationId, controller);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    try {
      for await (const event of streamNdjson(res, controller.signal)) {
        if (event.type === "conversation-created") {
          this.abortControllers.set(event.conversation.id, controller);
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
    }
  }

  async stopGeneration(conversationId: string) {
    this.abortControllers.get(conversationId)?.abort();
    this.abortControllers.delete(conversationId);
  }

  async *regenerate(
    conversationId: string,
    assistantMessageId: string,
    modelId?: string
  ): AsyncIterable<StreamEvent> {
    const controller = new AbortController();
    this.abortControllers.set(conversationId, controller);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regenerate: true,
        conversationId,
        assistantMessageId,
        modelId,
      }),
      signal: controller.signal,
    });
    try {
      yield* streamNdjson(res, controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) {
        yield {
          type: "error",
          message: e instanceof Error ? e.message : "连接中断",
        };
      }
    }
  }

  async setFeedback(messageId: string, feedback: "up" | "down" | null) {
    await fetchJson(`/api/messages/${messageId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    });
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
  async deleteProject(id: string) {
    await fetchJson(`/api/projects/${id}`, { method: "DELETE" });
  }
  listProjectConversations(projectId: string) {
    return fetchJson<Conversation[]>(`/api/projects/${projectId}/conversations`);
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
  saveSkill(s: Partial<Skill> & { name: string }) {
    return fetchJson<Skill>("/api/skills", {
      method: "POST",
      body: JSON.stringify(s),
    });
  }
  async deleteSkill(id: string) {
    await fetchJson(`/api/skills/${id}`, { method: "DELETE" });
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
    form.append("audio", audio, "recording.webm");
    const res = await fetch("/api/voice/transcribe", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "语音转写失败");
    }
    return res.json() as Promise<{ text: string }>;
  }
  async synthesizeSpeech(text: string): Promise<{ audioUrl: string }> {
    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
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
  getSettings() {
    return fetchJson<AppSettings>("/api/admin/settings");
  }
  saveSettings(patch: Parameters<AdminService["saveSettings"]>[0]) {
    return fetchJson<AppSettings>("/api/admin/settings", {
      method: "POST",
      body: JSON.stringify(patch),
    });
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

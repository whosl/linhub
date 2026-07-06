import type {
  AdminService,
  DataService,
} from "@/lib/data/service";
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
  SendMessageInput,
  Skill,
  StreamEvent,
  ToolCallPart,
  UsageRecord,
  User,
} from "@/lib/types";
import {
  mockArtifacts,
  mockConversations,
  mockDocuments,
  mockKnowledgeBases,
  mockLedger,
  mockMcpServers,
  mockMemories,
  mockMessages,
  mockModels,
  mockPlans,
  mockProjects,
  mockProviders,
  mockSettings,
  mockSkills,
  mockStyles,
  mockUsageRecords,
  mockUser,
  mockUsers,
} from "./fixtures";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();

/** 把长文本切成流式 delta 块 */
function* chunked(text: string, size = 6): Generator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

const MOCK_REPLY = `这是一条 **mock 回复**，用于演示流式输出效果。真实模型接入后，这里会是模型生成的内容。

你刚才说的是：

> {USER_TEXT}

## 我能演示的能力

1. 流式逐字输出（你现在看到的就是）
2. Markdown 完整渲染，比如公式 $e^{i\\pi} + 1 = 0$
3. 代码高亮：

\`\`\`typescript
const greet = (name: string) => \`Hello, \${name}!\`;
console.log(greet("LinHub"));
\`\`\`

接入真实 API 后（P2 阶段），同样的界面将由真实模型驱动。`;

const MOCK_REASONING =
  "用户发来了新消息，我先分析意图……这是 mock 模式，我将演示思考过程的流式展示效果。真实接入后，支持推理的模型会在这里展示完整的思考链。";

class MockAdminService implements AdminService {
  constructor(private s: MockStore) {}

  async listProviders() {
    await sleep(120);
    return [...this.s.providers];
  }
  async saveProvider(p: Partial<Provider> & { kind: Provider["kind"]; name: string; apiKey?: string }) {
    await sleep(200);
    const existing = p.id ? this.s.providers.find((x) => x.id === p.id) : undefined;
    if (existing) {
      Object.assign(existing, p, p.apiKey ? { apiKeyMasked: maskKey(p.apiKey) } : {});
      return { ...existing };
    }
    const created: Provider = {
      id: `pv-${uid()}`,
      kind: p.kind,
      name: p.name,
      baseUrl: p.baseUrl,
      apiKeyMasked: p.apiKey ? maskKey(p.apiKey) : undefined,
      enabled: p.enabled ?? true,
      storeEnabled: p.storeEnabled ?? true,
    };
    this.s.providers.push(created);
    return { ...created };
  }
  async deleteProvider(id: string) {
    await sleep(150);
    this.s.providers = this.s.providers.filter((p) => p.id !== id);
  }
  async listAllModels() {
    await sleep(120);
    return [...this.s.models];
  }
  async saveModel(m: Partial<Model> & { id?: string }) {
    await sleep(200);
    const existing = m.id ? this.s.models.find((x) => x.id === m.id) : undefined;
    if (existing) {
      Object.assign(existing, m);
      return { ...existing };
    }
    const created = { ...(m as Model), id: `m-${uid()}` };
    this.s.models.push(created);
    return { ...created };
  }
  async deleteModel(id: string) {
    await sleep(150);
    this.s.models = this.s.models.filter((m) => m.id !== id);
  }
  async listRemoteModels(providerId: string) {
    await sleep(400);
    const existing = new Set(
      this.s.models.filter((m) => m.providerId === providerId).map((m) => m.slug)
    );
    return ["demo-chat-large", "demo-chat-mini", "demo-vision-pro"].map((slug) => ({
      slug,
      added: existing.has(slug),
    }));
  }
  async addRemoteModels(providerId: string, slugs: string[]) {
    await sleep(300);
    let added = 0;
    for (const slug of slugs) {
      if (this.s.models.some((m) => m.providerId === providerId && m.slug === slug)) continue;
      const provider = this.s.providers.find((p) => p.id === providerId);
      this.s.models.push({
        id: `m-${uid()}`,
        providerId,
        providerKind: provider?.kind ?? "openai",
        slug,
        displayName: slug,
        capabilities: ["tools"],
        enabled: false,
        inputPricePerM: 0,
        outputPricePerM: 0,
        contextWindow: 128000,
        tier: "free",
      });
      added++;
    }
    return { added };
  }
  async getSettings() {
    await sleep(100);
    return { ...this.s.settings };
  }
  async saveSettings(patch: Partial<AppSettings> & { tavilyApiKey?: string; mimoApiKey?: string }) {
    await sleep(200);
    Object.assign(this.s.settings, patch);
    if (patch.tavilyApiKey) this.s.settings.tavilyApiKeyMasked = maskKey(patch.tavilyApiKey);
    if (patch.mimoApiKey) this.s.settings.mimoApiKeyMasked = maskKey(patch.mimoApiKey);
    return { ...this.s.settings };
  }
  async listUsers() {
    await sleep(120);
    return [...this.s.users];
  }
  async grantBalance(userId: string, amountCents: number) {
    await sleep(200);
    const u = this.s.users.find((x) => x.id === userId);
    if (u) u.balance += amountCents;
  }
  async listAllPlans() {
    await sleep(100);
    return [...this.s.plans];
  }
  async savePlan(p: Partial<Plan> & { name: string }) {
    await sleep(200);
    const existing = p.id ? this.s.plans.find((x) => x.id === p.id) : undefined;
    if (existing) {
      Object.assign(existing, p);
      return { ...existing };
    }
    const created: Plan = {
      id: `plan-${uid()}`,
      name: p.name,
      description: p.description ?? "",
      priceCentsPerMonth: p.priceCentsPerMonth ?? 0,
      monthlyQuotaCents: p.monthlyQuotaCents ?? 0,
      modelTier: p.modelTier ?? "free",
      features: p.features ?? [],
      enabled: p.enabled ?? true,
    };
    this.s.plans.push(created);
    return { ...created };
  }
  async deletePlan(id: string) {
    await sleep(150);
    this.s.plans = this.s.plans.filter((p) => p.id !== id);
  }
  async listPendingSkills() {
    await sleep(120);
    return this.s.skills.filter((sk) => sk.visibility === "pending");
  }
  async reviewSkill(id: string, approve: boolean) {
    await sleep(200);
    const sk = this.s.skills.find((x) => x.id === id);
    if (sk) sk.visibility = approve ? "public" : "private";
  }
  async listAllUsage() {
    await sleep(120);
    return [...this.s.usageRecords];
  }
}

function maskKey(key: string) {
  return key.length <= 8 ? "****" : `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/** 内存态存储：深拷贝 fixtures，会话内可变 */
class MockStore {
  user: User = structuredClone(mockUser);
  users: User[] = structuredClone(mockUsers);
  providers: Provider[] = structuredClone(mockProviders);
  models: Model[] = structuredClone(mockModels);
  styles: ChatStyle[] = structuredClone(mockStyles);
  conversations: Conversation[] = structuredClone(mockConversations);
  messages: Record<string, Message[]> = structuredClone(mockMessages);
  artifacts: Artifact[] = structuredClone(mockArtifacts);
  projects: Project[] = structuredClone(mockProjects);
  memories: MemoryEntry[] = structuredClone(mockMemories);
  knowledgeBases: KnowledgeBase[] = structuredClone(mockKnowledgeBases);
  documents: Record<string, KnowledgeDocument[]> = structuredClone(mockDocuments);
  skills: Skill[] = structuredClone(mockSkills);
  mcpServers: McpServer[] = structuredClone(mockMcpServers);
  plans: Plan[] = structuredClone(mockPlans);
  usageRecords: UsageRecord[] = structuredClone(mockUsageRecords);
  ledger: LedgerEntry[] = structuredClone(mockLedger);
  settings: AppSettings = structuredClone(mockSettings);
  aborted = new Set<string>();
}

export class MockDataService implements DataService {
  private s = new MockStore();
  admin: AdminService = new MockAdminService(this.s);

  // ---- 用户 ----
  async getCurrentUser() {
    await sleep(80);
    return { ...this.s.user };
  }
  async updateProfile(patch: { name?: string; avatarUrl?: string }) {
    await sleep(200);
    Object.assign(this.s.user, patch);
    return { ...this.s.user };
  }

  // ---- 模型与风格 ----
  async listModels() {
    await sleep(100);
    return this.s.models.filter((m) => m.enabled);
  }
  async listStyles() {
    await sleep(80);
    return [...this.s.styles];
  }
  async saveStyle(style: Partial<ChatStyle> & { name: string }) {
    await sleep(200);
    const existing = style.id ? this.s.styles.find((x) => x.id === style.id) : undefined;
    if (existing) {
      Object.assign(existing, style);
      return { ...existing };
    }
    const created: ChatStyle = {
      id: `style-${uid()}`,
      name: style.name,
      description: style.description ?? "",
      prompt: style.prompt,
      builtIn: false,
    };
    this.s.styles.push(created);
    return { ...created };
  }
  async deleteStyle(id: string) {
    await sleep(150);
    this.s.styles = this.s.styles.filter((x) => x.id !== id || x.builtIn);
  }

  // ---- 会话 ----
  async listConversations() {
    await sleep(100);
    return [...this.s.conversations].sort(
      (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
    );
  }
  async getConversation(id: string) {
    await sleep(60);
    return this.s.conversations.find((c) => c.id === id) ?? null;
  }
  async listMessages(conversationId: string) {
    await sleep(100);
    return [...(this.s.messages[conversationId] ?? [])];
  }
  async updateConversation(id: string, patch: Partial<Conversation>) {
    await sleep(120);
    const c = this.s.conversations.find((x) => x.id === id);
    if (!c) throw new Error("conversation not found");
    Object.assign(c, patch, { updatedAt: nowIso() });
    return { ...c };
  }
  async deleteConversation(id: string) {
    await sleep(150);
    this.s.conversations = this.s.conversations.filter((c) => c.id !== id);
    delete this.s.messages[id];
  }
  async searchConversations(query: string) {
    await sleep(150);
    const q = query.toLowerCase();
    return this.s.conversations.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      return (this.s.messages[c.id] ?? []).some((m) =>
        m.parts.some((p) => p.type === "text" && p.text.toLowerCase().includes(q))
      );
    });
  }

  // ---- 聊天（mock 流式） ----
  async *sendMessage(input: SendMessageInput): AsyncIterable<StreamEvent> {
    let conversation: Conversation;
    const isNew = !input.conversationId;
    if (isNew) {
      conversation = {
        id: `c-${uid()}`,
        title: "新对话",
        modelId: input.modelId,
        projectId: input.projectId,
        skillId: input.skillId,
        styleId: input.styleId,
        pinned: false,
        archived: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.s.conversations.unshift(conversation);
      this.s.messages[conversation.id] = [];
      yield { type: "conversation-created", conversation: { ...conversation } };
    } else {
      conversation = this.s.conversations.find((c) => c.id === input.conversationId)!;
      conversation.updatedAt = nowIso();
    }

    const msgs = this.s.messages[conversation.id];
    const parentId =
      input.parentId !== undefined ? input.parentId : conversation.currentLeafId ?? null;

    const userMessage: Message = {
      id: `msg-${uid()}`,
      conversationId: conversation.id,
      parentId,
      role: "user",
      parts: [
        ...(input.images ?? []),
        ...(input.attachments ?? []),
        { type: "text", text: input.text },
      ],
      quotedText: input.quotedText,
      createdAt: nowIso(),
      status: "complete",
    };
    msgs.push(userMessage);
    yield { type: "user-message", message: { ...userMessage } };

    yield* this.streamAssistant(conversation, userMessage.id, input.modelId, input.text, input.extendedThinking);

    if (isNew) {
      await sleep(300);
      conversation.title = input.text.slice(0, 20) || "新对话";
      yield { type: "title", conversationId: conversation.id, title: conversation.title };
    }
  }

  private async *streamAssistant(
    conversation: Conversation,
    parentId: string,
    modelId: string,
    userText: string,
    extendedThinking: boolean
  ): AsyncIterable<StreamEvent> {
    const msgs = this.s.messages[conversation.id];
    this.s.aborted.delete(conversation.id);

    const assistant: Message = {
      id: `msg-${uid()}`,
      conversationId: conversation.id,
      parentId,
      role: "assistant",
      modelId,
      parts: [],
      createdAt: nowIso(),
      status: "streaming",
    };
    msgs.push(assistant);
    conversation.currentLeafId = assistant.id;
    yield { type: "assistant-start", message: { ...assistant } };

    const stopped = () => this.s.aborted.has(conversation.id);

    // 1. 思考过程
    if (extendedThinking) {
      const start = Date.now();
      let reasoning = "";
      for (const delta of chunked(MOCK_REASONING, 5)) {
        if (stopped()) break;
        reasoning += delta;
        yield { type: "reasoning-delta", messageId: assistant.id, delta };
        await sleep(25);
      }
      assistant.parts.push({ type: "reasoning", text: reasoning, durationMs: Date.now() - start });
      yield { type: "reasoning-done", messageId: assistant.id, durationMs: Date.now() - start };
    }

    // 2. 演示工具调用（用户提到搜索类关键词时）
    if (!stopped() && /搜索|search|调研|新闻|最新/i.test(userText)) {
      const running: ToolCallPart = {
        type: "tool-call",
        toolCallId: `tc-${uid()}`,
        toolName: "web_search",
        args: { query: userText.slice(0, 30) },
        state: "running",
      };
      yield { type: "tool-call-start", messageId: assistant.id, part: { ...running } };
      await sleep(1400);
      const done: ToolCallPart = {
        ...running,
        state: "success",
        result: {
          sources: [
            { title: "Mock 搜索结果 1", url: "https://example.com/1", snippet: "这是一条演示用的搜索结果摘要……" },
            { title: "Mock 搜索结果 2", url: "https://example.com/2", snippet: "接入 Tavily 后这里将展示真实来源。" },
          ],
        },
      };
      assistant.parts.push(done);
      yield { type: "tool-call-end", messageId: assistant.id, part: { ...done } };
    }

    // 3. 正文流式
    if (!stopped()) {
      const reply = MOCK_REPLY.replace("{USER_TEXT}", userText || "（空）");
      let text = "";
      for (const delta of chunked(reply, 7)) {
        if (stopped()) break;
        text += delta;
        yield { type: "text-delta", messageId: assistant.id, delta };
        await sleep(18);
      }
      assistant.parts.push({ type: "text", text });
    }

    const finalStatus = stopped() ? "stopped" : "complete";
    assistant.status = finalStatus;
    assistant.usage = { inputTokens: 120, outputTokens: 380, costCents: 4 };
    this.s.usageRecords.unshift({
      id: `ur-${uid()}`,
      userId: this.s.user.id,
      modelId,
      modelName: this.s.models.find((m) => m.id === modelId)?.displayName ?? modelId,
      conversationId: conversation.id,
      inputTokens: 120,
      outputTokens: 380,
      costCents: 4,
      createdAt: nowIso(),
    });
    yield { type: "done", messageId: assistant.id, usage: assistant.usage, status: finalStatus };
  }

  async stopGeneration(conversationId: string) {
    this.s.aborted.add(conversationId);
  }

  async *regenerate(
    conversationId: string,
    assistantMessageId: string,
    modelId?: string
  ): AsyncIterable<StreamEvent> {
    const conversation = this.s.conversations.find((c) => c.id === conversationId);
    const msgs = this.s.messages[conversationId];
    if (!conversation || !msgs) return;
    const target = msgs.find((m) => m.id === assistantMessageId);
    if (!target || !target.parentId) return;
    const parent = msgs.find((m) => m.id === target.parentId);
    const userText =
      parent?.parts.find((p): p is { type: "text"; text: string } => p.type === "text")?.text ?? "";
    yield* this.streamAssistant(
      conversation,
      target.parentId,
      modelId ?? target.modelId ?? conversation.modelId,
      userText,
      true
    );
  }

  async setFeedback(messageId: string, feedback: "up" | "down" | null) {
    await sleep(100);
    for (const msgs of Object.values(this.s.messages)) {
      const m = msgs.find((x) => x.id === messageId);
      if (m) m.feedback = feedback ?? undefined;
    }
  }

  // ---- Artifacts ----
  async listArtifacts(conversationId: string) {
    await sleep(80);
    return this.s.artifacts.filter((a) => a.conversationId === conversationId);
  }
  async getArtifact(id: string) {
    await sleep(60);
    return this.s.artifacts.find((a) => a.id === id) ?? null;
  }
  async shareArtifact(id: string) {
    await sleep(200);
    const a = this.s.artifacts.find((x) => x.id === id);
    if (!a) throw new Error("artifact not found");
    a.shareToken = a.shareToken ?? uid();
    return { shareToken: a.shareToken };
  }

  // ---- Projects ----
  async listProjects() {
    await sleep(100);
    return [...this.s.projects];
  }
  async getProject(id: string) {
    await sleep(60);
    return this.s.projects.find((p) => p.id === id) ?? null;
  }
  async saveProject(p: Partial<Project> & { name: string }) {
    await sleep(200);
    const existing = p.id ? this.s.projects.find((x) => x.id === p.id) : undefined;
    if (existing) {
      Object.assign(existing, p, { updatedAt: nowIso() });
      return { ...existing };
    }
    const created: Project = {
      id: `proj-${uid()}`,
      name: p.name,
      description: p.description,
      instructions: p.instructions,
      color: p.color ?? "#C96442",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      conversationCount: 0,
      files: [],
    };
    this.s.projects.push(created);
    return { ...created };
  }
  async deleteProject(id: string) {
    await sleep(150);
    this.s.projects = this.s.projects.filter((p) => p.id !== id);
    this.s.conversations.forEach((c) => {
      if (c.projectId === id) c.projectId = undefined;
    });
  }
  async listProjectConversations(projectId: string) {
    await sleep(100);
    return this.s.conversations.filter((c) => c.projectId === projectId);
  }

  // ---- 记忆 ----
  async listMemories() {
    await sleep(100);
    return [...this.s.memories];
  }
  async saveMemory(entry: Partial<MemoryEntry> & { content: string }) {
    await sleep(200);
    const existing = entry.id ? this.s.memories.find((x) => x.id === entry.id) : undefined;
    if (existing) {
      Object.assign(existing, entry, { updatedAt: nowIso() });
      return { ...existing };
    }
    const created: MemoryEntry = {
      id: `mem-${uid()}`,
      content: entry.content,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.s.memories.unshift(created);
    return { ...created };
  }
  async deleteMemory(id: string) {
    await sleep(150);
    this.s.memories = this.s.memories.filter((m) => m.id !== id);
  }

  // ---- 知识库 ----
  async listKnowledgeBases() {
    await sleep(100);
    return [...this.s.knowledgeBases];
  }
  async saveKnowledgeBase(kb: Partial<KnowledgeBase> & { name: string }) {
    await sleep(200);
    const existing = kb.id ? this.s.knowledgeBases.find((x) => x.id === kb.id) : undefined;
    if (existing) {
      Object.assign(existing, kb, { updatedAt: nowIso() });
      return { ...existing };
    }
    const created: KnowledgeBase = {
      id: `kb-${uid()}`,
      name: kb.name,
      description: kb.description,
      documentCount: 0,
      totalChunks: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.s.knowledgeBases.push(created);
    this.s.documents[created.id] = [];
    return { ...created };
  }
  async deleteKnowledgeBase(id: string) {
    await sleep(150);
    this.s.knowledgeBases = this.s.knowledgeBases.filter((k) => k.id !== id);
    delete this.s.documents[id];
  }
  async listDocuments(kbId: string) {
    await sleep(100);
    return [...(this.s.documents[kbId] ?? [])];
  }
  async uploadDocument(kbId: string, file: File) {
    await sleep(600);
    const doc: KnowledgeDocument = {
      id: `doc-${uid()}`,
      knowledgeBaseId: kbId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      status: "processing",
      chunkCount: 0,
      createdAt: nowIso(),
    };
    (this.s.documents[kbId] ??= []).push(doc);
    const kb = this.s.knowledgeBases.find((k) => k.id === kbId);
    if (kb) kb.documentCount += 1;
    // 模拟异步解析完成
    setTimeout(() => {
      doc.status = "ready";
      doc.chunkCount = Math.max(4, Math.round(file.size / 2000));
      if (kb) kb.totalChunks += doc.chunkCount;
    }, 3000);
    return { ...doc };
  }
  async deleteDocument(kbId: string, docId: string) {
    await sleep(150);
    this.s.documents[kbId] = (this.s.documents[kbId] ?? []).filter((d) => d.id !== docId);
    const kb = this.s.knowledgeBases.find((k) => k.id === kbId);
    if (kb) kb.documentCount = this.s.documents[kbId].length;
  }

  // ---- Skills ----
  async listMySkills() {
    await sleep(100);
    return this.s.skills.filter((sk) => sk.ownerId === this.s.user.id);
  }
  async listMarketSkills() {
    await sleep(120);
    return this.s.skills.filter((sk) => sk.visibility === "public");
  }
  async getSkill(id: string) {
    await sleep(60);
    return this.s.skills.find((sk) => sk.id === id) ?? null;
  }
  async saveSkill(sk: Partial<Skill> & { name: string }) {
    await sleep(200);
    const existing = sk.id ? this.s.skills.find((x) => x.id === sk.id) : undefined;
    if (existing) {
      Object.assign(existing, sk, { updatedAt: nowIso() });
      return { ...existing };
    }
    const created: Skill = {
      id: `skill-${uid()}`,
      ownerId: this.s.user.id,
      name: sk.name,
      emoji: sk.emoji ?? "🤖",
      description: sk.description ?? "",
      systemPrompt: sk.systemPrompt ?? "",
      greeting: sk.greeting,
      defaultModelId: sk.defaultModelId,
      enabledTools: sk.enabledTools ?? [],
      knowledgeBaseIds: sk.knowledgeBaseIds ?? [],
      visibility: sk.visibility ?? "private",
      usageCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.s.skills.push(created);
    return { ...created };
  }
  async deleteSkill(id: string) {
    await sleep(150);
    this.s.skills = this.s.skills.filter((sk) => sk.id !== id);
  }

  // ---- MCP ----
  async listMcpServers(scope: "global" | "user") {
    await sleep(100);
    return this.s.mcpServers.filter((m) => m.scope === scope);
  }
  async saveMcpServer(server: Partial<McpServer> & { name: string; url: string }) {
    await sleep(250);
    const existing = server.id ? this.s.mcpServers.find((x) => x.id === server.id) : undefined;
    if (existing) {
      Object.assign(existing, server);
      return { ...existing };
    }
    const created: McpServer = {
      id: `mcp-${uid()}`,
      scope: server.scope ?? "user",
      ownerId: server.scope === "user" ? this.s.user.id : undefined,
      name: server.name,
      url: server.url,
      transport: server.transport ?? "streamable-http",
      enabled: true,
      status: "unknown",
      tools: [],
    };
    this.s.mcpServers.push(created);
    return { ...created };
  }
  async deleteMcpServer(id: string) {
    await sleep(150);
    this.s.mcpServers = this.s.mcpServers.filter((m) => m.id !== id);
  }
  async testMcpServer(id: string) {
    await sleep(1200);
    const server = this.s.mcpServers.find((m) => m.id === id);
    if (!server) return { ok: false, tools: [], error: "server not found" };
    server.status = "connected";
    if (server.tools.length === 0) {
      server.tools = [
        { name: "example_tool", description: "连接成功后发现的示例工具" },
      ];
    }
    return { ok: true, tools: server.tools };
  }

  // ---- 语音 ----
  async transcribeAudio() {
    await sleep(1500);
    return { text: "这是一段 mock 语音转写结果，接入 MiMo ASR 后将返回真实转写。" };
  }
  async synthesizeSpeech() {
    await sleep(800);
    return { audioUrl: "" };
  }

  // ---- 计费 ----
  async listUsageRecords() {
    await sleep(120);
    return [...this.s.usageRecords];
  }
  async listLedger() {
    await sleep(120);
    return [...this.s.ledger];
  }
  async listPlans() {
    await sleep(100);
    return this.s.plans.filter((p) => p.enabled);
  }
  async createOrder(input: { kind: Order["kind"]; amountCents?: number; planId?: string }) {
    await sleep(400);
    const order: Order = {
      id: `ord-${uid()}`,
      userId: this.s.user.id,
      kind: input.kind,
      amountCents:
        input.amountCents ??
        this.s.plans.find((p) => p.id === input.planId)?.priceCentsPerMonth ??
        0,
      planId: input.planId,
      status: "pending",
      channel: "mock",
      createdAt: nowIso(),
    };
    return order;
  }
  async redeemCode(code: string) {
    await sleep(600);
    if (code.length < 6) throw new Error("兑换码无效");
    const amountCents = 5000;
    this.s.user.balance += amountCents;
    this.s.ledger.unshift({
      id: `lg-${uid()}`,
      userId: this.s.user.id,
      amountCents,
      balanceAfterCents: this.s.user.balance,
      reason: "redeem",
      description: `兑换码 ${code}`,
      createdAt: nowIso(),
    });
    return { amountCents };
  }
}

/** 单例：整个前端共享一份 mock 状态 */
let instance: MockDataService | null = null;
export function getMockDataService(): MockDataService {
  instance ??= new MockDataService();
  return instance;
}

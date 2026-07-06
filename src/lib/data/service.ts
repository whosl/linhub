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
  RemoteModel,
  SendMessageInput,
  Skill,
  StreamEvent,
  UsageRecord,
  User,
} from "@/lib/types";

/**
 * 数据服务接口 — UI 只依赖此接口。
 * MockDataService（P0-P1）与 ApiDataService（P2+）都实现它。
 */
export interface DataService {
  // ---- 当前用户 ----
  getCurrentUser(): Promise<User | null>;
  updateProfile(patch: { name?: string; avatarUrl?: string }): Promise<User>;

  // ---- 模型与风格 ----
  listModels(): Promise<Model[]>;
  listStyles(): Promise<ChatStyle[]>;
  saveStyle(style: Partial<ChatStyle> & { name: string }): Promise<ChatStyle>;
  deleteStyle(id: string): Promise<void>;

  // ---- 会话 ----
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  listMessages(conversationId: string): Promise<Message[]>;
  updateConversation(
    id: string,
    patch: Partial<Pick<Conversation, "title" | "pinned" | "archived" | "projectId" | "currentLeafId" | "modelId">>
  ): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  searchConversations(query: string): Promise<Conversation[]>;

  // ---- 聊天（流式） ----
  sendMessage(input: SendMessageInput): AsyncIterable<StreamEvent>;
  stopGeneration(conversationId: string): Promise<void>;
  regenerate(
    conversationId: string,
    assistantMessageId: string,
    modelId?: string
  ): AsyncIterable<StreamEvent>;
  setFeedback(messageId: string, feedback: "up" | "down" | null): Promise<void>;

  // ---- Artifacts ----
  listArtifacts(conversationId: string): Promise<Artifact[]>;
  getArtifact(id: string): Promise<Artifact | null>;
  shareArtifact(id: string): Promise<{ shareToken: string }>;

  // ---- Projects ----
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  saveProject(p: Partial<Project> & { name: string }): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  listProjectConversations(projectId: string): Promise<Conversation[]>;

  // ---- 记忆 ----
  listMemories(): Promise<MemoryEntry[]>;
  saveMemory(entry: Partial<MemoryEntry> & { content: string }): Promise<MemoryEntry>;
  deleteMemory(id: string): Promise<void>;

  // ---- 知识库 ----
  listKnowledgeBases(): Promise<KnowledgeBase[]>;
  saveKnowledgeBase(kb: Partial<KnowledgeBase> & { name: string }): Promise<KnowledgeBase>;
  deleteKnowledgeBase(id: string): Promise<void>;
  listDocuments(kbId: string): Promise<KnowledgeDocument[]>;
  uploadDocument(kbId: string, file: File): Promise<KnowledgeDocument>;
  deleteDocument(kbId: string, docId: string): Promise<void>;

  // ---- Skills ----
  listMySkills(): Promise<Skill[]>;
  listMarketSkills(): Promise<Skill[]>;
  getSkill(id: string): Promise<Skill | null>;
  saveSkill(s: Partial<Skill> & { name: string }): Promise<Skill>;
  deleteSkill(id: string): Promise<void>;

  // ---- MCP ----
  listMcpServers(scope: "global" | "user"): Promise<McpServer[]>;
  saveMcpServer(s: Partial<McpServer> & { name: string; url: string }): Promise<McpServer>;
  deleteMcpServer(id: string): Promise<void>;
  testMcpServer(id: string): Promise<{ ok: boolean; tools: McpServer["tools"]; error?: string }>;

  // ---- 语音 ----
  transcribeAudio(audio: Blob): Promise<{ text: string }>;
  synthesizeSpeech(text: string): Promise<{ audioUrl: string }>;

  // ---- 计费（用户侧） ----
  listUsageRecords(): Promise<UsageRecord[]>;
  listLedger(): Promise<LedgerEntry[]>;
  listPlans(): Promise<Plan[]>;
  createOrder(input: { kind: Order["kind"]; amountCents?: number; planId?: string }): Promise<Order>;
  redeemCode(code: string): Promise<{ amountCents: number }>;

  // ---- 管理端 ----
  admin: AdminService;
}

export interface AdminService {
  listProviders(): Promise<Provider[]>;
  saveProvider(p: Partial<Provider> & { kind: Provider["kind"]; name: string; apiKey?: string }): Promise<Provider>;
  deleteProvider(id: string): Promise<void>;
  listAllModels(): Promise<Model[]>;
  saveModel(m: Partial<Model> & { id?: string }): Promise<Model>;
  deleteModel(id: string): Promise<void>;
  /** 调供应商 API 拉取远端模型列表（标记哪些已添加） */
  listRemoteModels(providerId: string): Promise<RemoteModel[]>;
  /** 批量添加选中的远端模型，返回新增数量 */
  addRemoteModels(providerId: string, slugs: string[]): Promise<{ added: number }>;
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings> & { tavilyApiKey?: string; mimoApiKey?: string }): Promise<AppSettings>;
  listUsers(): Promise<User[]>;
  grantBalance(userId: string, amountCents: number, note?: string): Promise<void>;
  listAllPlans(): Promise<Plan[]>;
  savePlan(p: Partial<Plan> & { name: string }): Promise<Plan>;
  deletePlan(id: string): Promise<void>;
  listPendingSkills(): Promise<Skill[]>;
  reviewSkill(id: string, approve: boolean): Promise<void>;
  listAllUsage(): Promise<UsageRecord[]>;
}

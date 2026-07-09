/**
 * LinHub 领域类型 — 前端与 DataService 层共享。
 * P0-P1 阶段由 MockDataService 提供数据，P2 起由 ApiDataService 实现同一接口。
 */

// ---------- 用户与认证 ----------

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
  balance: number; // 余额，单位：分
  /** 用户个人默认对话模型（覆盖全局默认） */
  defaultModelId?: string;
  subscription?: Subscription;
}

// ---------- 模型与供应商 ----------

export type ProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "zhipu"
  | "deepseek"
  | "xiaomi"
  | "xiaomi-token-plan";

export interface Provider {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl?: string;
  /** 管理端展示时只回传掩码 */
  apiKeyMasked?: string;
  enabled: boolean;
  /** 是否启用 OpenAI Responses API store 持久化（中转网关需关闭） */
  storeEnabled: boolean;
}

export type ModelCapability =
  | "vision"
  | "reasoning"
  | "tools"
  | "image-generation"
  | "web-search-native";

export interface Model {
  id: string;
  providerId: string;
  providerKind: ProviderKind;
  /** 调用时的真实模型名 */
  slug: string;
  /** 展示名 */
  displayName: string;
  description?: string;
  capabilities: ModelCapability[];
  enabled: boolean;
  /** 每百万输入 token 价格（分） */
  inputPricePerM: number;
  /** 每百万输出 token 价格（分） */
  outputPricePerM: number;
  /** 每张图片价格（分），仅生图模型 */
  pricePerImage?: number;
  contextWindow: number;
  /** 单次回复最大输出 token（空=供应商默认） */
  maxOutputTokens?: number;
  /** 订阅分级：free 所有人可用 / pro 需订阅 */
  tier: "free" | "pro";
  /** 模型选择器中的排序，小的在前 */
  sortOrder?: number;
}

/** 从供应商 API 拉取到的远端模型（尚未入库） */
export interface RemoteModel {
  slug: string;
  displayName?: string;
  /** 是否已添加进本站模型列表 */
  added: boolean;
}

// ---------- 消息与会话 ----------

export type MessageRole = "user" | "assistant" | "system";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ReasoningPart {
  type: "reasoning";
  text: string;
  durationMs?: number;
}

export type ToolName =
  | "web_search"
  | "web_read"
  | "tavily_extract"
  | "tavily_crawl"
  | "tavily_research"
  | "generate_image"
  | "edit_image"
  | "analyze_image"
  | "run_code"
  | "save_memory"
  | "search_memory"
  | "search_knowledge"
  | "create_artifact"
  | "update_artifact"
  | (string & {}); // MCP 工具名

export type ToolCallState = "running" | "success" | "error";

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: ToolName;
  /** 工具入参（用于卡片展示，如搜索关键词） */
  args: Record<string, unknown>;
  state: ToolCallState;
  /** 结果摘要，如搜索来源列表 */
  result?: ToolResultSummary;
  errorMessage?: string;
  /**
   * 工具参数生成中的原始 JSON 片段拼接（流式预览用）。
   * tool-input-start 时初始化为空串，tool-input-delta 时累加，
   * tool-call 到达后清空（args 已有完整结构化入参）。
   */
  inputPreview?: string;
}

export interface WebSource {
  title: string;
  url: string;
  snippet?: string;
  favicon?: string;
}

export interface ToolResultSummary {
  /** 搜索/阅读来源 */
  sources?: WebSource[];
  /** 生图结果 */
  images?: string[];
  /** 检索到的知识库片段 */
  chunks?: KnowledgeChunkRef[];
  /** 通用文本结果 */
  text?: string;
  /** 关联 artifact */
  artifactId?: string;
  /** Artifact 展示标题 */
  artifactTitle?: string;
  /** 工具产出的可下载附件 */
  attachments?: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    url: string;
  }[];
}

export interface ImagePart {
  type: "image";
  url: string;
  alt?: string;
  mediaAssetId?: string;
}

/** 统一媒体资产（上传 / 生成 / 编辑） */
export interface MediaAsset {
  id: string;
  ownerId: string;
  kind: "upload" | "generated" | "edited";
  name: string;
  mimeType: string;
  size: number;
  url: string;
  conversationId?: string;
  messageId?: string;
  projectId?: string;
  sourceTool?: string;
  /** 解析/识图后的文本预览（文档、表格、PPT、代码等上传文件可用） */
  extractedText?: string;
  createdAt: string;
}

export interface FilePart {
  type: "file";
  attachmentId: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
}

/** 内部元数据：记录本轮请求启用的工具，用于重新生成时恢复上下文。 */
export interface ToolConfigPart {
  type: "tool-config";
  /** 本轮最终使用的工具计划；旧消息里这个字段就是用户发送时的开关。 */
  tools: ChatToolToggles;
  /** 用户发送时的原始开关，用于区分“允许自动选择”和最终实际挂载。 */
  originalTools?: ChatToolToggles;
  routing?: ToolRoutingDecision;
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | ImagePart
  | FilePart
  | ToolConfigPart;

export interface Message {
  id: string;
  conversationId: string;
  /** 分支树：null 为根 */
  parentId: string | null;
  role: MessageRole;
  parts: MessagePart[];
  /** 生成此消息所用模型 */
  modelId?: string;
  createdAt: string;
  feedback?: "up" | "down";
  usage?: { inputTokens: number; outputTokens: number; costCents: number };
  /** 引用的文本片段（引用回复） */
  quotedText?: string;
  status: "complete" | "streaming" | "stopped" | "error";
}

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  skillId?: string;
  modelId?: string;
  styleId?: string;
  pinned: boolean;
  archived: boolean;
  /** 当前选中的叶子消息（决定展示哪条分支） */
  currentLeafId?: string;
  /** 搜索正文命中时，应打开的命中分支叶子；仅搜索结果返回。 */
  searchMatchLeafId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- 回复风格 ----------

export interface ChatStyle {
  id: string;
  name: string;
  description: string;
  /** 注入系统提示词的片段；内置风格 prompt 为空由服务端定义 */
  prompt?: string;
  builtIn: boolean;
}

// ---------- Projects ----------

export interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  modelId?: string;
  knowledgeBaseIds: string[];
  knowledgeBases: ProjectKnowledgeBase[];
  createdAt: string;
  updatedAt: string;
  conversationCount: number;
  files: ProjectFile[];
}

export interface ProjectKnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  totalChunks: number;
}

export interface ProjectFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

// ---------- Artifacts ----------

export type ArtifactKind =
  | "html"
  | "react"
  | "svg"
  | "markdown"
  | "code"
  | "mermaid";

export interface ArtifactVersion {
  version: number;
  content: string;
  createdAt: string;
}

export interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  kind: ArtifactKind;
  /** kind=code 时的语言 */
  language?: string;
  versions: ArtifactVersion[];
  currentVersion: number;
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- 记忆 ----------

export interface MemoryEntry {
  id: string;
  content: string;
  /** 来源会话 */
  sourceConversationId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- 知识库 ----------

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  totalChunks: number;
  createdAt: string;
  updatedAt: string;
}

export type DocumentStatus = "processing" | "ready" | "error";

export interface KnowledgeDocument {
  id: string;
  knowledgeBaseId: string;
  name: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  chunkCount: number;
  extractMethod?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface KnowledgeChunkRef {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  snippet: string;
  score: number;
}

// ---------- Skill（自定义助手） ----------

export type SkillKind = "prompt" | "pack";
export type SkillReviewStatus = "draft" | "pending" | "approved" | "rejected";

export interface SkillResourceRef {
  id: string;
  name: string;
  kind?: "instruction" | "reference" | "template" | "asset";
  description?: string;
  path?: string;
  mimeType?: string;
  size?: number;
  content?: string;
}

export interface SkillScriptPolicy {
  enabled: boolean;
  allowedScripts?: string[];
  timeoutMs?: number;
  network?: boolean;
}

export interface Skill {
  id: string;
  ownerId: string;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
  kind: SkillKind;
  version: string;
  source?: string;
  manifest?: Record<string, unknown>;
  packagePath?: string;
  requiredTools: ToolName[];
  resourceRefs: SkillResourceRef[];
  scriptPolicy: SkillScriptPolicy;
  reviewStatus: SkillReviewStatus;
  greeting?: string;
  defaultModelId?: string;
  enabledTools: ToolName[];
  knowledgeBaseIds: string[];
  /** 广场可见性 */
  visibility: "private" | "pending" | "public";
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------- MCP ----------

export type McpTransport = "sse" | "streamable-http";

export interface McpServer {
  id: string;
  scope: "global" | "user";
  ownerId?: string;
  name: string;
  url: string;
  transport: McpTransport;
  /** 请求头（含密钥，回传时掩码） */
  headersMasked?: Record<string, string>;
  enabled: boolean;
  /** 全局 MCP 是否默认对用户开启 */
  defaultEnabled?: boolean;
  status: "connected" | "error" | "unknown";
  tools: { name: string; description?: string }[];
}

// ---------- 计费与订阅 ----------

export interface UsageRecord {
  id: string;
  userId: string;
  modelId: string;
  modelName: string;
  conversationId?: string;
  inputTokens: number;
  outputTokens: number;
  imageCount?: number;
  costCents: number;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  /** 正为充值/赠送，负为消费 */
  amountCents: number;
  balanceAfterCents: number;
  reason: "recharge" | "usage" | "grant" | "refund" | "redeem";
  description: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceCentsPerMonth: number;
  /** 每月额度（分） */
  monthlyQuotaCents: number;
  /** 可用模型分级 */
  modelTier: "free" | "pro";
  features: string[];
  enabled: boolean;
}

export interface Subscription {
  planId: string;
  planName: string;
  modelTier: "free" | "pro";
  startedAt: string;
  expiresAt: string;
  usedQuotaCents: number;
  monthlyQuotaCents: number;
}

export interface Order {
  id: string;
  userId: string;
  kind: "recharge" | "subscription";
  amountCents: number;
  planId?: string;
  status: "pending" | "paid" | "failed" | "cancelled";
  channel: "mock" | "wechat" | "alipay" | "redeem-code";
  createdAt: string;
  paidAt?: string;
}

// ---------- 全局设置 ----------

export interface AppSettings {
  siteName: string;
  /** 全局默认对话模型 */
  defaultChatModelId?: string;
  /** 辅助识图模型 */
  visionHelperModelId?: string;
  /** 智能工具路由模型 */
  toolRouterModelId?: string;
  /** embedding 模型 */
  embeddingModelId?: string;
  // ---- 引擎配置 ----
  imageGenBaseUrl?: string;
  imageGenApiKeyMasked?: string;
  imageGenModel?: string;
  ttsBaseUrl?: string;
  ttsApiKeyMasked?: string;
  ttsModel?: string;
  asrBaseUrl?: string;
  asrApiKeyMasked?: string;
  asrModel?: string;
  searchBaseUrl?: string;
  // 旧字段（兼容）
  tavilyApiKeyMasked?: string;
  mimoApiKeyMasked?: string;
  mimoTtsVoice?: string;
  /** Skill 广场是否需要审核 */
  skillMarketRequiresReview: boolean;
  registrationEnabled: boolean;
}

export type EngineId = "image" | "tts" | "asr" | "search";

export interface EngineTestInput {
  engine: EngineId;
  config: {
    baseUrl?: string;
    model?: string;
    voice?: string;
    apiKey?: string;
  };
}

export type EngineTestResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

// ---------- 聊天发送与流式事件 ----------

export interface ChatToolToggles {
  /** 开启后由服务端按本轮请求自动挑选实际挂载的工具/MCP/Skill。 */
  autoRouting?: boolean;
  webSearch: boolean;
  imageGeneration: boolean;
  codeRunner: boolean;
  /**
   * 是否允许模型检索用户私有知识库。
   * 普通聊天中空 knowledgeBaseIds 表示全部知识库；项目聊天默认只使用项目文件和项目关联知识库。
   */
  knowledgeSearch: boolean;
  /** 启用的 MCP server id */
  mcpServerIds: string[];
  /** 本轮额外限定/加入的知识库范围 */
  knowledgeBaseIds: string[];
}

export type RoutingBuiltin =
  | "webSearch"
  | "imageGeneration"
  | "codeRunner"
  | "knowledgeSearch"
  | "spreadsheet"
  | "vision"
  | "artifacts"
  | "memory"
  | "pptx";

export interface ToolRoutingDecision {
  enabled: boolean;
  source: "manual" | "rules" | "model" | "mixed";
  finalTools: ChatToolToggles;
  selectedBuiltins: RoutingBuiltin[];
  selectedMcpServerIds: string[];
  selectedSkillIds: string[];
  labels: string[];
  reasons: string[];
}

export interface SendMessageInput {
  /** 客户端生成的本次请求 id；用于新会话拿到 conversationId 前停止后端生成。 */
  clientGenerationId?: string;
  conversationId?: string;
  /** 编辑重发/分支时指定父消息 */
  parentId?: string | null;
  text: string;
  attachments?: FilePart[];
  images?: ImagePart[];
  quotedText?: string;
  modelId?: string;
  styleId?: string;
  extendedThinking: boolean;
  tools: ChatToolToggles;
  projectId?: string;
  skillId?: string;
}

/** 流式事件：Mock 与真实后端使用同一协议 */
export type StreamEvent =
  | { type: "conversation-created"; conversation: Conversation }
  | { type: "user-message"; message: Message }
  | { type: "routing-decision"; messageId: string; decision: ToolRoutingDecision }
  | { type: "assistant-start"; message: Message }
  | { type: "assistant-snapshot"; message: Message }
  | { type: "reasoning-delta"; messageId: string; delta: string }
  | { type: "reasoning-done"; messageId: string; durationMs: number }
  | { type: "text-delta"; messageId: string; delta: string }
  | { type: "tool-call-start"; messageId: string; part: ToolCallPart }
  | { type: "tool-call-end"; messageId: string; part: ToolCallPart }
  | { type: "tool-input-start"; messageId: string; toolCallId: string; toolName: ToolName }
  | { type: "tool-input-delta"; messageId: string; toolCallId: string; delta: string }
  | { type: "image"; messageId: string; part: ImagePart }
  | { type: "artifact"; messageId: string; artifact: Artifact }
  | { type: "title"; conversationId: string; title: string }
  | {
      type: "done";
      messageId: string;
      usage?: Message["usage"];
      status: Message["status"];
    }
  | { type: "error"; messageId?: string; message: string }
  | {
      /** I13: 心跳，防止 CDN/代理在长 reasoning/tool 期间因空闲超时断流 */
      type: "ping";
    };

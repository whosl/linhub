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
  subscription?: Subscription;
}

// ---------- 模型与供应商 ----------

export type ProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "zhipu"
  | "deepseek"
  | "xiaomi";

export interface Provider {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl?: string;
  /** 管理端展示时只回传掩码 */
  apiKeyMasked?: string;
  enabled: boolean;
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
  /** 订阅分级：free 所有人可用 / pro 需订阅 */
  tier: "free" | "pro";
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
}

export interface ImagePart {
  type: "image";
  url: string;
  alt?: string;
}

export interface FilePart {
  type: "file";
  attachmentId: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | ImagePart
  | FilePart;

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
  modelId: string;
  styleId?: string;
  pinned: boolean;
  archived: boolean;
  /** 当前选中的叶子消息（决定展示哪条分支） */
  currentLeafId?: string;
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
  createdAt: string;
  updatedAt: string;
  conversationCount: number;
  files: ProjectFile[];
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

export interface Skill {
  id: string;
  ownerId: string;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
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
  /** 辅助识图模型 */
  visionHelperModelId?: string;
  /** embedding 模型 */
  embeddingModelId?: string;
  tavilyApiKeyMasked?: string;
  mimoApiKeyMasked?: string;
  mimoTtsVoice?: string;
  /** Skill 广场是否需要审核 */
  skillMarketRequiresReview: boolean;
  registrationEnabled: boolean;
}

// ---------- 聊天发送与流式事件 ----------

export interface ChatToolToggles {
  webSearch: boolean;
  imageGeneration: boolean;
  codeRunner: boolean;
  /** 启用的 MCP server id */
  mcpServerIds: string[];
  /** 挂载的知识库 */
  knowledgeBaseIds: string[];
}

export interface SendMessageInput {
  conversationId?: string;
  /** 编辑重发/分支时指定父消息 */
  parentId?: string | null;
  text: string;
  attachments?: FilePart[];
  images?: ImagePart[];
  quotedText?: string;
  modelId: string;
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
  | { type: "assistant-start"; message: Message }
  | { type: "reasoning-delta"; messageId: string; delta: string }
  | { type: "reasoning-done"; messageId: string; durationMs: number }
  | { type: "text-delta"; messageId: string; delta: string }
  | { type: "tool-call-start"; messageId: string; part: ToolCallPart }
  | { type: "tool-call-end"; messageId: string; part: ToolCallPart }
  | { type: "image"; messageId: string; part: ImagePart }
  | { type: "artifact"; messageId: string; artifact: Artifact }
  | { type: "title"; conversationId: string; title: string }
  | {
      type: "done";
      messageId: string;
      usage?: Message["usage"];
      status: Message["status"];
    }
  | { type: "error"; messageId?: string; message: string };

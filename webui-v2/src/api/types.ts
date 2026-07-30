// 后端实体契约类型 —— 字段名必须与后端保持一致

export interface Subscription {
  planId: string;
  planName: string;
  modelTier: "free" | "pro";
  startedAt: string;
  expiresAt: string;
  usedQuotaCents: number;
  /** -1 表示无限 */
  monthlyQuotaCents: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: "admin" | "user";
  createdAt: string;
  /** 余额,整数分 */
  balance: number;
  defaultModelId?: string;
  subscription?: Subscription;
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
  currentLeafId?: string;
  searchMatchLeafId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TextPart {
  type: "text";
  text: string;
}

export interface ReasoningPart {
  type: "reasoning";
  text: string;
  durationMs?: number;
}

export interface ToolResultSummary {
  sources?: { title: string; url: string; snippet?: string; favicon?: string }[];
  images?: string[];
  chunks?: {
    documentId: string;
    documentName: string;
    chunkIndex: number;
    snippet: string;
    score: number;
  }[];
  text?: string;
  skillRunId?: string;
  skillName?: string;
  artifactId?: string;
  artifactTitle?: string;
  attachments?: { id: string; name: string; mimeType: string; size: number; url?: string }[];
  timedOut?: boolean;
  exitCode?: number;
  durationMs?: number;
  outputLimitExceeded?: boolean;
  sheets?: { name: string; headers: string[]; rowCount: number }[];
  slides?: unknown[];
  slideCount?: number;
  [key: string]: unknown;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args?: unknown;
  state: "running" | "success" | "error";
  result?: ToolResultSummary;
  errorMessage?: string;
  inputPreview?: string;
}

export interface ImagePart {
  type: "image";
  url: string;
  alt?: string;
  mediaAssetId?: string;
}

export interface FilePart {
  type: "file";
  attachmentId: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
}

/** 本次发送的工具开关(后端的 4 个内置工具 + MCP / 知识库选择) */
export interface ChatToolToggles {
  autoRouting?: boolean;
  webSearch: boolean;
  imageGeneration: boolean;
  codeRunner: boolean;
  knowledgeSearch: boolean;
  mcpServerIds: string[];
  knowledgeBaseIds: string[];
}

export interface ToolRoutingDecision {
  enabled: boolean;
  source: "manual" | "rules" | "model" | "mixed";
  selectedBuiltins?: string[];
  selectedMcpServerIds?: string[];
  selectedSkillIds?: string[];
  labels?: string[];
  reasons?: string[];
  [key: string]: unknown;
}

export interface ToolConfigPart {
  type: "tool-config";
  tools: ChatToolToggles;
  originalTools?: ChatToolToggles;
  routing?: ToolRoutingDecision;
}

export interface SkillRunPart {
  type: "skill-run";
  runId: string;
  skillName: string;
}

export interface SkillRunReceiptPart {
  type: "skill-run-receipt";
  runId: string;
  runAttempt: number;
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | ImagePart
  | FilePart
  | ToolConfigPart
  | SkillRunPart
  | SkillRunReceiptPart;

export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface Message {
  id: string;
  conversationId: string;
  parentId: string | null;
  role: "user" | "assistant" | "system" | "skill-run-receipt";
  parts: MessagePart[];
  modelId?: string;
  createdAt: string;
  feedback?: "up" | "down";
  usage?: MessageUsage;
  quotedText?: string;
  status: "complete" | "streaming" | "stopped" | "error";
  /** 客户端乐观发送状态(仅本地存在,后端不返回) */
  deliveryState?: "sending" | "accepted" | "failed";
  deliveryError?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  conversationCount: number;
}

/** 模型目录条目(capabilities 取值含 vision/reasoning/tools/image-generation/web-search-native) */
export interface Model {
  id: string;
  providerId: string;
  providerKind: string;
  slug: string;
  displayName: string;
  description?: string;
  capabilities: string[];
  enabled: boolean;
  /** 整数分 / 百万 token */
  inputPricePerM: number;
  outputPricePerM: number;
  pricePerImage?: number;
  contextWindow: number;
  maxOutputTokens?: number;
  tier: "free" | "pro";
  sortOrder?: number;
}

export interface ChatStyle {
  id: string;
  name: string;
  description: string;
  prompt?: string;
  builtIn: boolean;
}

/** 聊天流式协议:NDJSON 每行一个事件 */
export type StreamEvent =
  | { type: "conversation-created"; conversation: Conversation }
  | { type: "user-message"; message: Message }
  | { type: "assistant-start"; message: Message }
  | { type: "assistant-snapshot"; message: Message }
  | { type: "routing-decision"; messageId: string; decision: ToolRoutingDecision }
  | { type: "reasoning-delta"; messageId: string; delta: string }
  | { type: "reasoning-done"; messageId: string; durationMs?: number }
  | { type: "text-delta"; messageId: string; delta: string }
  | { type: "tool-call-start"; messageId: string; part: ToolCallPart }
  | { type: "tool-call-end"; messageId: string; part: ToolCallPart }
  | { type: "tool-input-start"; messageId: string; toolCallId: string; toolName: string }
  | { type: "tool-input-delta"; messageId: string; toolCallId: string; delta: string }
  | { type: "image"; messageId: string; part: ImagePart }
  | {
      type: "artifact";
      messageId: string;
      artifact: { id: string; title: string; kind: string; [k: string]: unknown };
    }
  | { type: "title"; conversationId: string; title: string }
  | {
      type: "done";
      messageId: string;
      usage?: MessageUsage;
      status: "complete" | "stopped" | "error";
    }
  | { type: "error"; messageId?: string; message: string }
  | { type: "ping" };

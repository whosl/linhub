import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

// ---------- 认证（better-auth 标准表） ----------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  balanceCents: integer("balance_cents").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- 供应商与模型 ----------

export const providers = pgTable("providers", {
  id: text("id").primaryKey(),
  kind: text("kind", {
    enum: ["openai", "anthropic", "google", "zhipu", "deepseek", "xiaomi"],
  }).notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url"),
  /** AES-GCM 加密后的 API key */
  apiKeyEncrypted: text("api_key_encrypted"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const models = pgTable("models", {
  id: text("id").primaryKey(),
  providerId: text("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  inputPricePerM: integer("input_price_per_m").notNull().default(0),
  outputPricePerM: integer("output_price_per_m").notNull().default(0),
  pricePerImage: integer("price_per_image"),
  contextWindow: integer("context_window").notNull().default(128000),
  /** 单次回复最大输出 token（空=不限制，走供应商默认） */
  maxOutputTokens: integer("max_output_tokens"),
  tier: text("tier", { enum: ["free", "pro"] })
    .notNull()
    .default("free"),
  /** 模型选择器中的排序，小的在前 */
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- 会话与消息 ----------

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  instructions: text("instructions"),
  color: text("color"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("新对话"),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    skillId: text("skill_id"),
    modelId: text("model_id").notNull(),
    styleId: text("style_id"),
    pinned: boolean("pinned").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    currentLeafId: text("current_leaf_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("conversations_owner_idx").on(t.ownerId, t.updatedAt)]
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull().default([]),
    modelId: text("model_id"),
    quotedText: text("quoted_text"),
    feedback: text("feedback", { enum: ["up", "down"] }),
    status: text("status", {
      enum: ["complete", "streaming", "stopped", "error"],
    })
      .notNull()
      .default("complete"),
    usage: jsonb("usage").$type<{
      inputTokens: number;
      outputTokens: number;
      costCents: number;
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)]
);

// ---------- 风格 / Skill / 记忆 / 知识库 ----------

export const styles = pgTable("styles", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  prompt: text("prompt"),
  builtIn: boolean("built_in").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const skills = pgTable("skills", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🤖"),
  description: text("description").notNull().default(""),
  systemPrompt: text("system_prompt").notNull(),
  greeting: text("greeting"),
  defaultModelId: text("default_model_id"),
  enabledTools: jsonb("enabled_tools").$type<string[]>().notNull().default([]),
  knowledgeBaseIds: jsonb("knowledge_base_ids").$type<string[]>().notNull().default([]),
  visibility: text("visibility", { enum: ["private", "pending", "public"] })
    .notNull()
    .default("private"),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const memories = pgTable(
  "memories",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    sourceConversationId: text("source_conversation_id"),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("memories_owner_idx").on(t.ownerId)]
);

export const knowledgeBases = pgTable("knowledge_bases", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const kbDocuments = pgTable("kb_documents", {
  id: text("id").primaryKey(),
  knowledgeBaseId: text("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull().default(0),
  status: text("status", { enum: ["processing", "ready", "error"] })
    .notNull()
    .default("processing"),
  chunkCount: integer("chunk_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => kbDocuments.id, { onDelete: "cascade" }),
    knowledgeBaseId: text("knowledge_base_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("kb_chunks_kb_idx").on(t.knowledgeBaseId)]
);

// ---------- Artifacts / 项目文件 / 附件 ----------

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind", {
    enum: ["html", "react", "svg", "markdown", "code", "mermaid"],
  }).notNull(),
  language: text("language"),
  versions: jsonb("versions")
    .$type<{ version: number; content: string; createdAt: string }[]>()
    .notNull()
    .default([]),
  currentVersion: integer("current_version").notNull().default(1),
  shareToken: text("share_token").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const attachments = pgTable("attachments", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull().default(0),
  /** 存储路径（本地 data/uploads 或对象存储 key） */
  storagePath: text("storage_path").notNull(),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- MCP ----------

export const mcpServers = pgTable("mcp_servers", {
  id: text("id").primaryKey(),
  scope: text("scope", { enum: ["global", "user"] }).notNull(),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  transport: text("transport", { enum: ["sse", "streamable-http"] })
    .notNull()
    .default("streamable-http"),
  headersEncrypted: text("headers_encrypted"),
  enabled: boolean("enabled").notNull().default(true),
  status: text("status", { enum: ["connected", "error", "unknown"] })
    .notNull()
    .default("unknown"),
  tools: jsonb("tools")
    .$type<{ name: string; description?: string }[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- 计费 ----------

export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    modelName: text("model_name").notNull(),
    conversationId: text("conversation_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    imageCount: integer("image_count"),
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("usage_user_idx").on(t.userId, t.createdAt)]
);

export const ledger = pgTable(
  "ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    reason: text("reason", {
      enum: ["recharge", "usage", "grant", "refund", "redeem"],
    }).notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ledger_user_idx").on(t.userId, t.createdAt)]
);

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCentsPerMonth: integer("price_cents_per_month").notNull().default(0),
  monthlyQuotaCents: integer("monthly_quota_cents").notNull().default(0),
  modelTier: text("model_tier", { enum: ["free", "pro"] })
    .notNull()
    .default("free"),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  usedQuotaCents: integer("used_quota_cents").notNull().default(0),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["recharge", "subscription"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  planId: text("plan_id"),
  status: text("status", {
    enum: ["pending", "paid", "failed", "cancelled"],
  })
    .notNull()
    .default("pending"),
  channel: text("channel", {
    enum: ["mock", "wechat", "alipay", "redeem-code"],
  }).notNull(),
  /** 第三方支付平台订单号，唯一约束保证回调幂等（M1） */
  externalOrderId: text("external_order_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  paidAt: timestamp("paid_at"),
});

export const redeemCodes = pgTable("redeem_codes", {
  code: text("code").primaryKey(),
  amountCents: integer("amount_cents").notNull(),
  usedBy: text("used_by"),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- 全局设置（单行） ----------

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("global"),
  siteName: text("site_name").notNull().default("LinHub"),
  visionHelperModelId: text("vision_helper_model_id"),
  embeddingModelId: text("embedding_model_id"),
  tavilyApiKeyEncrypted: text("tavily_api_key_encrypted"),
  mimoApiKeyEncrypted: text("mimo_api_key_encrypted"),
  mimoTtsVoice: text("mimo_tts_voice"),
  skillMarketRequiresReview: boolean("skill_market_requires_review")
    .notNull()
    .default(true),
  registrationEnabled: boolean("registration_enabled").notNull().default(true),
});

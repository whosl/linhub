import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
  /** 用户个人默认对话模型（覆盖全局默认），为空则用全局默认 */
  defaultModelId: text("default_model_id"),
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
    enum: [
      "openai",
      "anthropic",
      "google",
      "zhipu",
      "deepseek",
      "xiaomi",
      "xiaomi-token-plan",
    ],
  }).notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url"),
  /** AES-GCM 加密后的 API key */
  apiKeyEncrypted: text("api_key_encrypted"),
  enabled: boolean("enabled").notNull().default(true),
  /**
   * 是否启用 OpenAI Responses API 的服务端 store 持久化（默认开启）。
   * 直连官方 OpenAI 保持开启即可；走第三方中转网关（不持久化 reasoning item）
   * 时需关闭，否则 reasoning 模型多步工具循环会因引用上一轮的 rs_xxx 而 404。
   */
  storeEnabled: boolean("store_enabled").notNull().default(true),
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
  /** 项目级默认模型（新建会话时回退用） */
  modelId: text("model_id"),
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
  /** Agent Skills 标准 name（目录 slug）；旧提示词 Skill 可为空。 */
  slug: text("slug"),
  emoji: text("emoji").notNull().default("🤖"),
  description: text("description").notNull().default(""),
  systemPrompt: text("system_prompt").notNull(),
  kind: text("kind", { enum: ["prompt", "pack"] }).notNull().default("prompt"),
  version: text("version").notNull().default("1.0.0"),
  source: text("source").notNull().default("user"),
  license: text("license"),
  compatibility: text("compatibility"),
  allowedTools: jsonb("allowed_tools").$type<string[]>().notNull().default([]),
  packageDigest: text("package_digest"),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull().default({}),
  packagePath: text("package_path"),
  requiredTools: jsonb("required_tools").$type<string[]>().notNull().default([]),
  resourceRefs: jsonb("resource_refs")
    .$type<
      {
        id: string;
        name: string;
        kind?: string;
        description?: string;
        path?: string;
        mimeType?: string;
        size?: number;
        content?: string;
      }[]
    >()
    .notNull()
    .default([]),
  scriptPolicy: jsonb("script_policy")
    .$type<{
      enabled: boolean;
      allowedScripts?: string[];
      timeoutMs?: number;
      network?: boolean;
    }>()
    .notNull()
    .default({ enabled: false }),
  reviewStatus: text("review_status", {
    enum: ["draft", "pending", "approved", "rejected"],
  })
    .notNull()
    .default("approved"),
  publishedAt: timestamp("published_at"),
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

// ---------- 持久 Skill Run / Subagent ----------

export const skillRuns = pgTable(
  "skill_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    skillId: text("skill_id").references(() => skills.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    skillName: text("skill_name").notNull(),
    status: text("status", {
      enum: ["queued", "running", "waiting_input", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    stage: text("stage").notNull().default("等待执行"),
    progress: integer("progress").notNull().default(0),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    /** 同一 Skill Run 每次重试都会递增，用于生成稳定且不重复的完成回执消息。 */
    runAttempt: integer("run_attempt").notNull().default(1),
    completionReceiptStatus: text("completion_receipt_status", {
      enum: ["pending", "generating", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    completionMessageId: text("completion_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    completionReceiptError: text("completion_receipt_error"),
    completionReceiptUpdatedAt: timestamp("completion_receipt_updated_at"),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("skill_run_owner_idx").on(table.ownerId, table.createdAt),
    index("skill_run_queue_idx").on(table.status, table.createdAt),
    index("skill_run_conversation_idx").on(table.conversationId, table.createdAt),
  ]
);

export const skillRunSteps = pgTable(
  "skill_run_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => skillRuns.id, { onDelete: "cascade" }),
    parentStepId: text("parent_step_id"),
    kind: text("kind", {
      enum: ["coordinator", "subagent", "tool", "approval", "artifact"],
    }).notNull(),
    label: text("label").notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "cancelled", "skipped"],
    })
      .notNull()
      .default("queued"),
    progress: integer("progress").notNull().default(0),
    sourceCount: integer("source_count").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    modelId: text("model_id"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("skill_run_step_run_idx").on(table.runId, table.createdAt)]
);

export const skillRunEvents = pgTable(
  "skill_run_events",
  {
    sequence: bigserial("sequence", { mode: "number" }).primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => skillRuns.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("skill_run_event_cursor_idx").on(table.runId, table.sequence)]
);

export const memories = pgTable(
  "memories",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    sourceConversationId: text("source_conversation_id"),
    /** 项目级记忆：只在该项目内注入/检索；null=全局记忆 */
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
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
  /** pdf | docx | pptx | xlsx | csv | text | code | vision … */
  extractMethod: text("extract_method"),
  errorMessage: text("error_message"),
  /** 原文件相对路径，供 analyze_spreadsheet 等工具重读 */
  storagePath: text("storage_path"),
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

export const projectKnowledgeBases = pgTable(
  "project_knowledge_bases",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    knowledgeBaseId: text("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_knowledge_bases_unique").on(t.projectId, t.knowledgeBaseId),
    index("project_knowledge_bases_project_idx").on(t.projectId),
  ]
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

/** 统一媒体资产：上传 / 生成 / 编辑，私有存储 + 鉴权读取 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["upload", "generated", "edited"] }).notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull().default(0),
    /** 私有相对路径：data/media/{ownerId}/{id}.ext */
    storageKey: text("storage_key").notNull(),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id"),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    sourceTool: text("source_tool"),
    extractedText: text("extracted_text"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("media_owner_idx").on(t.ownerId, t.createdAt),
    index("media_kind_idx").on(t.ownerId, t.kind),
  ]
);

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
  /** 全局 MCP 是否默认对用户开启（仍需用户偏好或聊天开关确认） */
  defaultEnabled: boolean("default_enabled").notNull().default(false),
  status: text("status", { enum: ["connected", "error", "unknown"] })
    .notNull()
    .default("unknown"),
  tools: jsonb("tools")
    .$type<{ name: string; description?: string }[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 用户对 MCP 服务器的启用偏好（含全局服务器） */
export const userMcpPreferences = pgTable(
  "user_mcp_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_mcp_pref_unique").on(t.userId, t.serverId)]
);

// ---------- 计费 ----------

export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** chat | image | image-edit | embedding | tts | asr | vision-helper | web-search */
    capability: text("capability").notNull().default("chat"),
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

export const subscriptions = pgTable(
  "subscriptions",
  {
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
  },
  (t) => [uniqueIndex("subscriptions_user_unique").on(t.userId)]
);

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
  /** 全局默认对话模型（管理员设置，用户未自定义时用这个） */
  defaultChatModelId: text("default_chat_model_id"),
  visionHelperModelId: text("vision_helper_model_id"),
  toolRouterModelId: text("tool_router_model_id"),
  embeddingModelId: text("embedding_model_id"),

  // ---- 引擎配置（文本/生图/TTS/ASR/搜索各自独立） ----
  // 旧字段保留兼容：mimo* / tavily* 在新字段为空时回退使用
  tavilyApiKeyEncrypted: text("tavily_api_key_encrypted"),
  mimoApiKeyEncrypted: text("mimo_api_key_encrypted"),
  mimoTtsVoice: text("mimo_tts_voice"),

  /** 图像生成引擎 */
  imageGenBaseUrl: text("image_gen_base_url"),
  imageGenApiKeyEncrypted: text("image_gen_api_key_encrypted"),
  imageGenModel: text("image_gen_model"),

  /** 语音合成 (TTS) 引擎 */
  ttsBaseUrl: text("tts_base_url"),
  ttsApiKeyEncrypted: text("tts_api_key_encrypted"),
  ttsModel: text("tts_model"),

  /** 语音识别 (ASR) 引擎 */
  asrBaseUrl: text("asr_base_url"),
  asrApiKeyEncrypted: text("asr_api_key_encrypted"),
  asrModel: text("asr_model"),

  /** 联网搜索引擎 */
  searchBaseUrl: text("search_base_url"),

  /** 引擎单价（分）：缺省见 billing/capabilities 默认值 */
  ttsPriceCentsPerRequest: integer("tts_price_cents_per_request")
    .notNull()
    .default(2),
  asrPriceCentsPerRequest: integer("asr_price_cents_per_request")
    .notNull()
    .default(3),
  webSearchPriceCentsPerRequest: integer("web_search_price_cents_per_request")
    .notNull()
    .default(1),

  skillMarketRequiresReview: boolean("skill_market_requires_review")
    .notNull()
    .default(true),
  registrationEnabled: boolean("registration_enabled").notNull().default(true),
});

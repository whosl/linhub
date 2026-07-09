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
  Plan,
  Project,
  Provider,
  Skill,
  UsageRecord,
  User,
} from "@/lib/types";

const now = Date.now();
const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// ---------- 用户 ----------

export const mockUser: User = {
  id: "u-admin",
  email: "admin@linhub.app",
  name: "Wenzhuo",
  role: "admin",
  createdAt: iso(30 * DAY),
  balance: 128_50,
  subscription: {
    planId: "plan-pro",
    planName: "Pro",
    modelTier: "pro",
    startedAt: iso(10 * DAY),
    expiresAt: iso(-20 * DAY),
    usedQuotaCents: 2350,
    monthlyQuotaCents: 10000,
  },
};

export const mockUsers: User[] = [
  mockUser,
  {
    id: "u-2",
    email: "luna@example.com",
    name: "Luna",
    role: "user",
    createdAt: iso(12 * DAY),
    balance: 500,
  },
  {
    id: "u-3",
    email: "kai@example.com",
    name: "Kai",
    role: "user",
    createdAt: iso(3 * DAY),
    balance: 2000,
  },
];

// ---------- 供应商与模型 ----------

export const mockProviders: Provider[] = [
  { id: "pv-openai", kind: "openai", name: "OpenAI", apiKeyMasked: "sk-...k3Fa", enabled: true, storeEnabled: true },
  { id: "pv-anthropic", kind: "anthropic", name: "Anthropic", apiKeyMasked: "sk-ant-...9xQ2", enabled: true, storeEnabled: true },
  { id: "pv-google", kind: "google", name: "Google Gemini", apiKeyMasked: "AIza...pL8w", enabled: true, storeEnabled: true },
  { id: "pv-zhipu", kind: "zhipu", name: "智谱 GLM", apiKeyMasked: "e5f2...a1b9", enabled: true, storeEnabled: true },
  { id: "pv-deepseek", kind: "deepseek", name: "DeepSeek", apiKeyMasked: "sk-...m2Nc", enabled: true, storeEnabled: true },
  { id: "pv-xiaomi", kind: "xiaomi", name: "Xiaomi MiMo", apiKeyMasked: "mm-...t7Rd", enabled: true, storeEnabled: true },
  { id: "pv-xiaomi-token-plan", kind: "xiaomi-token-plan", name: "Xiaomi MiMo Token Plan", apiKeyMasked: "mm-...t7Rd", enabled: true, storeEnabled: true },
];

export const mockModels: Model[] = [
  {
    id: "m-gpt5",
    providerId: "pv-openai",
    providerKind: "openai",
    slug: "gpt-5.2",
    displayName: "GPT-5.2",
    description: "OpenAI 旗舰模型，综合能力最强",
    capabilities: ["vision", "reasoning", "tools"],
    enabled: true,
    inputPricePerM: 1750,
    outputPricePerM: 14000,
    contextWindow: 400_000,
    tier: "pro",
  },
  {
    id: "m-claude",
    providerId: "pv-anthropic",
    providerKind: "anthropic",
    slug: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    description: "写作与编码能力出色，长上下文",
    capabilities: ["vision", "reasoning", "tools"],
    enabled: true,
    inputPricePerM: 2100,
    outputPricePerM: 10500,
    contextWindow: 1_000_000,
    tier: "pro",
  },
  {
    id: "m-gemini",
    providerId: "pv-google",
    providerKind: "google",
    slug: "gemini-3-pro",
    displayName: "Gemini 3 Pro",
    description: "多模态理解强，超长上下文",
    capabilities: ["vision", "reasoning", "tools"],
    enabled: true,
    inputPricePerM: 875,
    outputPricePerM: 7000,
    contextWindow: 2_000_000,
    tier: "free",
  },
  {
    id: "m-glm",
    providerId: "pv-zhipu",
    providerKind: "zhipu",
    slug: "glm-5",
    displayName: "GLM-5",
    description: "智谱旗舰，原生联网搜索与网页阅读",
    capabilities: ["vision", "reasoning", "tools", "web-search-native"],
    enabled: true,
    inputPricePerM: 350,
    outputPricePerM: 1400,
    contextWindow: 200_000,
    tier: "free",
  },
  {
    id: "m-deepseek",
    providerId: "pv-deepseek",
    providerKind: "deepseek",
    slug: "deepseek-v4",
    displayName: "DeepSeek V4",
    description: "高性价比推理模型",
    capabilities: ["reasoning", "tools"],
    enabled: true,
    inputPricePerM: 140,
    outputPricePerM: 560,
    contextWindow: 128_000,
    tier: "free",
  },
  {
    id: "m-gpt-image",
    providerId: "pv-openai",
    providerKind: "openai",
    slug: "gpt-image-2",
    displayName: "GPT Image 2",
    description: "图像生成与编辑",
    capabilities: ["image-generation"],
    enabled: true,
    inputPricePerM: 700,
    outputPricePerM: 0,
    pricePerImage: 28,
    contextWindow: 32_000,
    tier: "free",
  },
];

// ---------- 回复风格 ----------

export const mockStyles: ChatStyle[] = [
  { id: "style-normal", name: "标准", description: "默认平衡的回复风格", builtIn: true },
  { id: "style-concise", name: "简洁", description: "简短直接，直击要点", builtIn: true },
  { id: "style-explanatory", name: "详解", description: "耐心展开，适合学习", builtIn: true },
  { id: "style-formal", name: "正式", description: "严谨书面语，适合商务", builtIn: true },
  {
    id: "style-custom-1",
    name: "犀利点评",
    description: "毒舌但专业的技术点评风格",
    prompt: "你是一位犀利但专业的技术评论员，直接指出问题，不绕弯子。",
    builtIn: false,
  },
];

// ---------- Projects ----------

export const mockProjects: Project[] = [
  {
    id: "proj-1",
    name: "LinHub 产品设计",
    description: "AI 聊天应用的产品规划与设计讨论",
    instructions: "你是资深产品设计顾问，回答时结合 ChatGPT/Claude 的最佳实践。",
    color: "#C96442",
    knowledgeBaseIds: ["kb-1"],
    knowledgeBases: [
      {
        id: "kb-1",
        name: "技术文档库",
        description: "个人收集的框架文档与最佳实践",
        documentCount: 3,
        totalChunks: 486,
      },
    ],
    createdAt: iso(8 * DAY),
    updatedAt: iso(2 * HOUR),
    conversationCount: 3,
    files: [
      { id: "pf-1", name: "产品需求文档.pdf", mimeType: "application/pdf", size: 2_412_000, createdAt: iso(7 * DAY) },
      { id: "pf-2", name: "竞品分析.md", mimeType: "text/markdown", size: 45_800, createdAt: iso(5 * DAY) },
    ],
  },
  {
    id: "proj-2",
    name: "毕业论文",
    description: "分布式系统方向论文写作",
    color: "#6C9BD1",
    knowledgeBaseIds: ["kb-2"],
    knowledgeBases: [
      {
        id: "kb-2",
        name: "论文资料",
        description: "分布式系统相关论文",
        documentCount: 2,
        totalChunks: 210,
      },
    ],
    createdAt: iso(20 * DAY),
    updatedAt: iso(3 * DAY),
    conversationCount: 5,
    files: [
      { id: "pf-3", name: "文献综述.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 890_000, createdAt: iso(18 * DAY) },
    ],
  },
];

// ---------- 会话与消息 ----------

export const mockConversations: Conversation[] = [
  {
    id: "c-welcome",
    title: "LinHub 能做什么",
    modelId: "m-claude",
    pinned: true,
    archived: false,
    createdAt: iso(2 * HOUR),
    updatedAt: iso(20 * MIN),
    currentLeafId: "msg-w4",
  },
  {
    id: "c-search",
    title: "2026 年前端框架趋势调研",
    modelId: "m-glm",
    pinned: false,
    archived: false,
    createdAt: iso(5 * HOUR),
    updatedAt: iso(4 * HOUR),
    currentLeafId: "msg-s2",
  },
  {
    id: "c-artifact",
    title: "贪吃蛇小游戏",
    modelId: "m-gpt5",
    pinned: false,
    archived: false,
    createdAt: iso(1 * DAY),
    updatedAt: iso(22 * HOUR),
    currentLeafId: "msg-a2",
  },
  {
    id: "c-image",
    title: "赛博朋克城市插画",
    modelId: "m-claude",
    pinned: false,
    archived: false,
    createdAt: iso(2 * DAY),
    updatedAt: iso(2 * DAY),
    currentLeafId: "msg-i2",
  },
  {
    id: "c-proj-1",
    title: "订阅定价策略讨论",
    projectId: "proj-1",
    modelId: "m-gpt5",
    pinned: false,
    archived: false,
    createdAt: iso(3 * DAY),
    updatedAt: iso(2 * HOUR),
    currentLeafId: "msg-p2",
  },
  {
    id: "c-old-1",
    title: "Rust 所有权机制解析",
    modelId: "m-deepseek",
    pinned: false,
    archived: false,
    createdAt: iso(6 * DAY),
    updatedAt: iso(6 * DAY),
    currentLeafId: "msg-r2",
  },
  {
    id: "c-archived",
    title: "旅行计划：京都五日游",
    modelId: "m-gemini",
    pinned: false,
    archived: true,
    createdAt: iso(15 * DAY),
    updatedAt: iso(14 * DAY),
  },
];

/**
 * Markdown 模板标签：保留 \int、\pi 等 LaTeX 反斜杠（raw），
 * 仅把 \` 还原为反引号，使代码围栏正常解析。
 */
const md = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.raw
    .map((s) => s.replace(/\\`/g, "`"))
    .reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ""), "");

export const mockMessages: Record<string, Message[]> = {
  "c-welcome": [
    {
      id: "msg-w1",
      conversationId: "c-welcome",
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "你好！简单介绍一下 LinHub 能做什么？顺便展示一下你的 Markdown 渲染能力。" }],
      createdAt: iso(2 * HOUR),
      status: "complete",
    },
    {
      id: "msg-w2",
      conversationId: "c-welcome",
      parentId: "msg-w1",
      role: "assistant",
      modelId: "m-claude",
      parts: [
        {
          type: "reasoning",
          text: "用户想了解产品能力，同时希望看到 Markdown 渲染效果。我应该给出一个结构化的回答，涵盖标题、列表、表格、代码块、数学公式等元素，既介绍功能又自然展示渲染能力。",
          durationMs: 3200,
        },
        {
          type: "text",
          text: md`你好！欢迎使用 **LinHub** —— 一个多模型 AI 助手。下面用一段富文本介绍我的能力：

## 核心功能

1. **多模型对话** — GPT、Claude、Gemini、GLM、DeepSeek 随意切换
2. **联网搜索** — 我可以自主搜索和阅读网页获取最新信息
3. **图像能力** — 生成、编辑图片，也能理解你上传的图片
4. **Artifacts** — 生成可交互的网页、组件和文档
5. **代码运行** — 直接在浏览器里运行 Python 和 JavaScript

## 各模型定位一览

| 模型 | 强项 | 上下文 |
| --- | --- | --- |
| GPT-5.2 | 综合推理 | 400K |
| Claude Sonnet 5 | 写作与编码 | 1M |
| GLM-5 | 中文与原生联网 | 200K |

## 代码示例

\`\`\`python
def fib(n: int) -> int:
    """经典的斐波那契数列"""
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print([fib(i) for i in range(10)])
\`\`\`

数学公式也不在话下——质能方程 $E = mc^2$，以及块级公式：

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

> 💡 试试让我搜索最新资讯、画一张图，或者写一个小游戏！`,
        },
      ],
      createdAt: iso(2 * HOUR - MIN),
      usage: { inputTokens: 42, outputTokens: 486, costCents: 5 },
      status: "complete",
    },
    {
      id: "msg-w3",
      conversationId: "c-welcome",
      parentId: "msg-w2",
      role: "user",
      parts: [{ type: "text", text: "用 Mermaid 画一下你处理一条消息的流程图。" }],
      createdAt: iso(25 * MIN),
      status: "complete",
    },
    {
      id: "msg-w4",
      conversationId: "c-welcome",
      parentId: "msg-w3",
      role: "assistant",
      modelId: "m-claude",
      parts: [
        {
          type: "text",
          text: md`好的，这是我处理一条消息的完整流程：

\`\`\`mermaid
flowchart TD
    A[收到用户消息] --> B{需要工具吗}
    B -->|需要| C[调用工具]
    C --> D[web_search / 生图 / 代码运行]
    D --> E[整合工具结果]
    E --> B
    B -->|不需要| F[流式生成回答]
    F --> G[记录用量与计费]
\`\`\`

整个过程是一个 **Agent 循环**：我会反复判断是否需要调用工具，直到信息足够，才输出最终回答。`,
        },
      ],
      createdAt: iso(20 * MIN),
      usage: { inputTokens: 530, outputTokens: 180, costCents: 3 },
      status: "complete",
    },
  ],

  "c-search": [
    {
      id: "msg-s1",
      conversationId: "c-search",
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "帮我调研一下 2026 年前端框架的最新趋势，要有数据来源。" }],
      createdAt: iso(5 * HOUR),
      status: "complete",
    },
    {
      id: "msg-s2",
      conversationId: "c-search",
      parentId: "msg-s1",
      role: "assistant",
      modelId: "m-glm",
      parts: [
        {
          type: "reasoning",
          text: "这是一个时效性问题，我需要先搜索最新的数据，再阅读关键来源，最后汇总。",
          durationMs: 1800,
        },
        {
          type: "tool-call",
          toolCallId: "tc-s1",
          toolName: "web_search",
          args: { query: "2026 前端框架趋势 State of JS" },
          state: "success",
          result: {
            sources: [
              { title: "State of JS 2025 Results", url: "https://stateofjs.com/2025", snippet: "React 仍居使用率首位，但满意度被 Svelte 与 Solid 超越……" },
              { title: "Frontend Frameworks in 2026 — A Deep Dive", url: "https://frontendweekly.dev/2026-frameworks", snippet: "Signals 成为各框架的共同底层机制……" },
              { title: "npm trends: react vs vue vs svelte vs solid", url: "https://npmtrends.com/react-vs-vue-vs-svelte", snippet: "下载量对比显示 React 依旧断层领先……" },
            ],
          },
        },
        {
          type: "tool-call",
          toolCallId: "tc-s2",
          toolName: "web_read",
          args: { url: "https://stateofjs.com/2025" },
          state: "success",
          result: { text: "已读取 State of JS 2025 完整报告，提取关键统计数据。" },
        },
        {
          type: "text",
          text: md`根据搜索结果，2026 年前端框架的几个关键趋势：

## 1. Signals 成为事实标准

几乎所有主流框架都已内置细粒度响应式：Vue 的 \`ref\`、Svelte 5 的 Runes、Solid 的 Signals，React 也在实验 \`use signals\` 提案[^1]。

## 2. 使用率与满意度分化

- **使用率**：React（68%）> Vue（42%）> Svelte（29%）
- **满意度**：Svelte（91%）> Solid（89%）> React（72%）

## 3. 全栈化与 RSC 普及

Next.js App Router 的服务端组件模式被 Nuxt、SvelteKit 借鉴，前后端边界持续模糊[^2]。

[^1]: [State of JS 2025 Results](https://stateofjs.com/2025)
[^2]: [Frontend Frameworks in 2026](https://frontendweekly.dev/2026-frameworks)`,
        },
      ],
      createdAt: iso(4 * HOUR),
      usage: { inputTokens: 1250, outputTokens: 420, costCents: 2 },
      status: "complete",
    },
  ],

  "c-artifact": [
    {
      id: "msg-a1",
      conversationId: "c-artifact",
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "写一个贪吃蛇小游戏，可以直接玩的那种。" }],
      createdAt: iso(1 * DAY),
      status: "complete",
    },
    {
      id: "msg-a2",
      conversationId: "c-artifact",
      parentId: "msg-a1",
      role: "assistant",
      modelId: "m-gpt5",
      parts: [
        {
          type: "tool-call",
          toolCallId: "tc-a1",
          toolName: "create_artifact",
          args: { title: "贪吃蛇", kind: "html" },
          state: "success",
          result: { artifactId: "art-snake" },
        },
        {
          type: "text",
          text: "我做了一个经典的贪吃蛇游戏，已经在右侧面板打开。\n\n**操作方式**：方向键控制移动，吃到食物加分，撞墙或撞到自己则游戏结束。\n\n特性：\n- 平滑的网格动画\n- 分数与最高分记录\n- 逐渐加快的游戏节奏\n\n想加音效或者改成手机触屏操作吗？",
        },
      ],
      createdAt: iso(22 * HOUR),
      usage: { inputTokens: 80, outputTokens: 1250, costCents: 18 },
      status: "complete",
    },
  ],

  "c-image": [
    {
      id: "msg-i1",
      conversationId: "c-image",
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "画一张赛博朋克风格的雨夜城市街景，霓虹灯倒映在湿漉漉的路面上。" }],
      createdAt: iso(2 * DAY),
      status: "complete",
    },
    {
      id: "msg-i2",
      conversationId: "c-image",
      parentId: "msg-i1",
      role: "assistant",
      modelId: "m-claude",
      parts: [
        {
          type: "reasoning",
          text: "用户想要生成图片，我应该调用 generate_image 工具，把描述扩写为更详细的英文 prompt。",
          durationMs: 1500,
        },
        {
          type: "tool-call",
          toolCallId: "tc-i1",
          toolName: "generate_image",
          args: { prompt: "cyberpunk city street at rainy night, neon signs reflecting on wet pavement, cinematic lighting, ultra detailed" },
          state: "success",
          result: { images: ["/mock/cyberpunk.svg"] },
        },
        { type: "image", url: "/mock/cyberpunk.svg", alt: "赛博朋克雨夜城市街景" },
        {
          type: "text",
          text: "画好了！我强化了霓虹灯的色彩层次（品红与青色对撞）和路面反光的细节。如果想调整构图、加入人物剪影或者换成白天版本，告诉我即可。",
        },
      ],
      createdAt: iso(2 * DAY - 2 * MIN),
      usage: { inputTokens: 95, outputTokens: 130, costCents: 30 },
      status: "complete",
    },
  ],

  "c-proj-1": [
    {
      id: "msg-p1",
      conversationId: "c-proj-1",
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "参考项目里的产品需求文档，帮我设计订阅套餐的定价梯度。" }],
      createdAt: iso(3 * DAY),
      status: "complete",
    },
    {
      id: "msg-p2",
      conversationId: "c-proj-1",
      parentId: "msg-p1",
      role: "assistant",
      modelId: "m-gpt5",
      parts: [
        {
          type: "tool-call",
          toolCallId: "tc-p1",
          toolName: "search_knowledge",
          args: { query: "订阅 定价 目标用户" },
          state: "success",
          result: {
            chunks: [
              { documentId: "pf-1", documentName: "产品需求文档.pdf", chunkIndex: 12, snippet: "目标用户为国内 AI 重度使用者，对价格敏感度中等，愿为稳定服务付费……", score: 0.91 },
            ],
          },
        },
        {
          type: "text",
          text: md`结合需求文档中"价格敏感度中等"的用户画像，建议三档定价：

| 档位 | 月费 | 额度 | 可用模型 |
| --- | --- | --- | --- |
| 免费 | ¥0 | ¥3/月 | 基础模型 |
| 标准 | ¥29 | ¥40/月 | 全部模型 |
| Pro | ¥79 | ¥120/月 | 全部模型 + 优先响应 |

关键设计：**额度按成本价的 1.3 倍折算**，标准档覆盖 80% 用户的月用量，Pro 档针对重度用户留出利润空间。`,
        },
      ],
      createdAt: iso(2 * HOUR),
      usage: { inputTokens: 2100, outputTokens: 350, costCents: 9 },
      status: "complete",
    },
  ],

  "c-old-1": [
    {
      id: "msg-r1",
      conversationId: "c-old-1",
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "用最简单的方式解释 Rust 的所有权机制。" }],
      createdAt: iso(6 * DAY),
      status: "complete",
    },
    {
      id: "msg-r2",
      conversationId: "c-old-1",
      parentId: "msg-r1",
      role: "assistant",
      modelId: "m-deepseek",
      parts: [
        {
          type: "reasoning",
          text: "用户要求'最简单的方式'，我用一个生活化比喻加最小代码示例来解释，避免堆砌术语。",
          durationMs: 5400,
        },
        {
          type: "text",
          text: md`把内存想象成一本书：

1. **所有权** — 每本书同一时刻只有一个主人（一个值只有一个所有者）
2. **移动** — 把书送给朋友后，你就不能再读它了（赋值即转移）
3. **借用** — 朋友可以**借**你的书看（引用），但借出去期间你不能把书撕了

\`\`\`rust
let book = String::from("Rust 圣经");
let friend = book;          // 所有权移动给 friend
// println!("{book}");      // ❌ 编译错误：book 已失效
println!("{friend}");        // ✅
\`\`\`

编译器在编译期就检查这些规则，所以 Rust 不需要垃圾回收也能保证内存安全。`,
        },
      ],
      createdAt: iso(6 * DAY - 3 * MIN),
      usage: { inputTokens: 30, outputTokens: 280, costCents: 1 },
      status: "complete",
    },
  ],

  "c-archived": [],
};

// ---------- Artifacts ----------

const snakeHtml = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>贪吃蛇</title>
<style>
  body { margin:0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; background:#1a1a2e; font-family:system-ui; color:#eee; }
  h1 { font-size:18px; letter-spacing:4px; margin-bottom:8px; }
  #score { margin-bottom:12px; color:#4ade80; font-variant-numeric:tabular-nums; }
  canvas { border-radius:12px; background:#16213e; box-shadow:0 8px 40px rgba(0,0,0,.5); }
</style>
</head>
<body>
<h1>SNAKE</h1>
<div id="score">分数 0 · 最高 0</div>
<canvas id="game" width="360" height="360"></canvas>
<script>
const cv = document.getElementById('game'), cx = cv.getContext('2d');
const N = 18, S = cv.width / N;
let snake, dir, food, score = 0, best = 0, timer;
function reset() {
  snake = [{x:9,y:9}]; dir = {x:1,y:0}; score = 0; place(); tick();
}
function place() { food = { x: Math.floor(Math.random()*N), y: Math.floor(Math.random()*N) }; }
function tick() {
  clearInterval(timer);
  timer = setInterval(step, Math.max(70, 160 - score*4));
}
function step() {
  const h = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  if (h.x<0||h.y<0||h.x>=N||h.y>=N||snake.some(s=>s.x===h.x&&s.y===h.y)) return reset();
  snake.unshift(h);
  if (h.x===food.x && h.y===food.y) { score++; best = Math.max(best, score); place(); tick(); }
  else snake.pop();
  draw();
}
function draw() {
  cx.clearRect(0,0,cv.width,cv.height);
  cx.fillStyle = '#f43f5e';
  cx.beginPath(); cx.arc(food.x*S+S/2, food.y*S+S/2, S*0.35, 0, 7); cx.fill();
  snake.forEach((s,i) => {
    cx.fillStyle = i ? '#22c55e' : '#4ade80';
    cx.beginPath(); cx.roundRect(s.x*S+2, s.y*S+2, S-4, S-4, 6); cx.fill();
  });
  document.getElementById('score').textContent = \`分数 \${score} · 最高 \${best}\`;
}
addEventListener('keydown', e => {
  const m = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0] }[e.key];
  if (m && !(m[0]===-dir.x && m[1]===-dir.y)) { dir = {x:m[0], y:m[1]}; e.preventDefault(); }
});
reset();
</script>
</body>
</html>`;

export const mockArtifacts: Artifact[] = [
  {
    id: "art-snake",
    conversationId: "c-artifact",
    title: "贪吃蛇",
    kind: "html",
    versions: [
      { version: 1, content: snakeHtml.replace("160 - score*4", "160"), createdAt: iso(23 * HOUR) },
      { version: 2, content: snakeHtml, createdAt: iso(22 * HOUR) },
    ],
    currentVersion: 2,
    createdAt: iso(23 * HOUR),
    updatedAt: iso(22 * HOUR),
  },
];

// ---------- 记忆 ----------

export const mockMemories: MemoryEntry[] = [
  { id: "mem-1", content: "用户叫 Wenzhuo，是一名全栈开发者，主用 TypeScript 和 React。", sourceConversationId: "c-welcome", createdAt: iso(10 * DAY), updatedAt: iso(10 * DAY) },
  { id: "mem-2", content: "用户正在开发一个叫 LinHub 的多模型 AI 聊天应用。", sourceConversationId: "c-proj-1", createdAt: iso(3 * DAY), updatedAt: iso(3 * DAY) },
  { id: "mem-3", content: "用户偏好简体中文回复，代码注释用中文。", createdAt: iso(8 * DAY), updatedAt: iso(2 * DAY) },
];

// ---------- 知识库 ----------

export const mockKnowledgeBases: KnowledgeBase[] = [
  { id: "kb-1", name: "技术文档库", description: "个人收集的框架文档与最佳实践", documentCount: 3, totalChunks: 486, createdAt: iso(15 * DAY), updatedAt: iso(1 * DAY) },
  { id: "kb-2", name: "论文资料", description: "分布式系统相关论文", documentCount: 2, totalChunks: 210, createdAt: iso(20 * DAY), updatedAt: iso(5 * DAY) },
];

export const mockDocuments: Record<string, KnowledgeDocument[]> = {
  "kb-1": [
    { id: "doc-1", knowledgeBaseId: "kb-1", name: "React 19 官方文档.pdf", mimeType: "application/pdf", size: 4_210_000, status: "ready", chunkCount: 220, createdAt: iso(15 * DAY) },
    { id: "doc-2", knowledgeBaseId: "kb-1", name: "Next.js App Router 指南.md", mimeType: "text/markdown", size: 156_000, status: "ready", chunkCount: 86, createdAt: iso(10 * DAY) },
    { id: "doc-3", knowledgeBaseId: "kb-1", name: "TypeScript 手册.pdf", mimeType: "application/pdf", size: 3_800_000, status: "processing", chunkCount: 180, createdAt: iso(1 * DAY) },
  ],
  "kb-2": [
    { id: "doc-4", knowledgeBaseId: "kb-2", name: "Raft 共识算法论文.pdf", mimeType: "application/pdf", size: 980_000, status: "ready", chunkCount: 120, createdAt: iso(20 * DAY) },
    { id: "doc-5", knowledgeBaseId: "kb-2", name: "Spanner 论文笔记.md", mimeType: "text/markdown", size: 88_000, status: "ready", chunkCount: 90, createdAt: iso(5 * DAY) },
  ],
};

// ---------- Skills ----------

const mockSkillDefaults = {
  kind: "prompt",
  version: "1.0.0",
  requiredTools: [],
  resourceRefs: [],
  scriptPolicy: { enabled: false },
  reviewStatus: "approved",
} satisfies Pick<
  Skill,
  "kind" | "version" | "requiredTools" | "resourceRefs" | "scriptPolicy" | "reviewStatus"
>;

export const mockSkills: Skill[] = [
  {
    ...mockSkillDefaults,
    id: "skill-1",
    ownerId: "u-admin",
    name: "代码审查员",
    emoji: "🔍",
    description: "严格的代码审查助手，关注性能、安全与可维护性",
    systemPrompt: "你是一位资深代码审查员。审查代码时按严重程度分级列出问题，给出修改建议和示例代码。",
    greeting: "把代码贴给我，我来帮你做一次全面审查。",
    defaultModelId: "m-claude",
    enabledTools: ["web_search", "run_code"],
    knowledgeBaseIds: ["kb-1"],
    visibility: "public",
    usageCount: 128,
    createdAt: iso(12 * DAY),
    updatedAt: iso(2 * DAY),
  },
  {
    ...mockSkillDefaults,
    id: "skill-2",
    ownerId: "u-admin",
    name: "中英互译",
    emoji: "🌐",
    description: "信达雅的中英互译，保留原文语气",
    systemPrompt: "你是专业译者。收到中文译成英文，收到英文译成中文。保留语气与格式，术语准确。",
    defaultModelId: "m-glm",
    enabledTools: [],
    knowledgeBaseIds: [],
    visibility: "private",
    usageCount: 56,
    createdAt: iso(8 * DAY),
    updatedAt: iso(8 * DAY),
  },
  {
    ...mockSkillDefaults,
    id: "skill-3",
    ownerId: "u-2",
    name: "论文润色",
    emoji: "🎓",
    description: "学术论文语言润色与逻辑梳理",
    systemPrompt: "你是学术写作专家，帮助润色论文段落，指出逻辑跳跃并给出改写建议。",
    defaultModelId: "m-gpt5",
    enabledTools: ["search_knowledge"],
    knowledgeBaseIds: [],
    visibility: "public",
    usageCount: 342,
    createdAt: iso(20 * DAY),
    updatedAt: iso(6 * DAY),
  },
  {
    ...mockSkillDefaults,
    reviewStatus: "pending",
    id: "skill-4",
    ownerId: "u-3",
    name: "小红书文案",
    emoji: "✨",
    description: "爆款小红书笔记文案生成",
    systemPrompt: "你是小红书爆款写手，输出带 emoji 的种草文案，含标题、正文、标签。",
    defaultModelId: "m-glm",
    enabledTools: ["web_search"],
    knowledgeBaseIds: [],
    visibility: "pending",
    usageCount: 0,
    createdAt: iso(1 * DAY),
    updatedAt: iso(1 * DAY),
  },
];

// ---------- MCP ----------

export const mockMcpServers: McpServer[] = [
  {
    id: "mcp-1",
    scope: "global",
    name: "Tavily MCP",
    url: "https://mcp.tavily.com/mcp",
    transport: "streamable-http",
    headersMasked: { Authorization: "Bearer tvly-...8xKq" },
    enabled: true,
    status: "connected",
    tools: [
      { name: "tavily_search", description: "网络搜索" },
      { name: "tavily_extract", description: "网页内容提取" },
      { name: "tavily_crawl", description: "站点爬取" },
    ],
  },
  {
    id: "mcp-2",
    scope: "global",
    name: "智谱识图 MCP",
    url: "https://open.bigmodel.cn/api/mcp/vision",
    transport: "sse",
    headersMasked: { Authorization: "Bearer e5f2...a1b9" },
    enabled: true,
    status: "connected",
    tools: [{ name: "glm_vision_analyze", description: "图像理解与 OCR" }],
  },
  {
    id: "mcp-user-1",
    scope: "user",
    ownerId: "u-admin",
    name: "我的 Notion",
    url: "https://mcp.notion.com/mcp",
    transport: "streamable-http",
    headersMasked: { Authorization: "Bearer ntn_...k2Lm" },
    enabled: true,
    status: "connected",
    tools: [
      { name: "notion_search", description: "搜索 Notion 页面" },
      { name: "notion_create_page", description: "创建页面" },
    ],
  },
];

// ---------- 计费 ----------

export const mockPlans: Plan[] = [
  {
    id: "plan-free",
    name: "免费版",
    description: "轻度使用，体验全部基础功能",
    priceCentsPerMonth: 0,
    monthlyQuotaCents: 300,
    modelTier: "free",
    features: ["基础模型无限对话", "每月 ¥3 额度", "联网搜索", "代码运行器"],
    enabled: true,
  },
  {
    id: "plan-standard",
    name: "标准版",
    description: "覆盖日常所有场景",
    priceCentsPerMonth: 2900,
    monthlyQuotaCents: 4000,
    modelTier: "pro",
    features: ["全部模型", "每月 ¥40 额度", "图像生成", "知识库 RAG", "自定义 Skill"],
    enabled: true,
  },
  {
    id: "plan-pro",
    name: "Pro",
    description: "重度用户与专业工作流",
    priceCentsPerMonth: 7900,
    monthlyQuotaCents: 12000,
    modelTier: "pro",
    features: ["全部模型优先响应", "每月 ¥120 额度", "用户级 MCP", "Artifacts 分享", "优先客服"],
    enabled: true,
  },
];

export const mockUsageRecords: UsageRecord[] = [
  { id: "ur-1", userId: "u-admin", modelId: "m-claude", modelName: "Claude Sonnet 5", conversationId: "c-welcome", inputTokens: 572, outputTokens: 666, costCents: 8, createdAt: iso(20 * MIN) },
  { id: "ur-2", userId: "u-admin", modelId: "m-glm", modelName: "GLM-5", conversationId: "c-search", inputTokens: 1250, outputTokens: 420, costCents: 2, createdAt: iso(4 * HOUR) },
  { id: "ur-3", userId: "u-admin", modelId: "m-gpt5", modelName: "GPT-5.2", conversationId: "c-artifact", inputTokens: 80, outputTokens: 1250, costCents: 18, createdAt: iso(22 * HOUR) },
  { id: "ur-4", userId: "u-admin", modelId: "m-gpt-image", modelName: "GPT Image 2", conversationId: "c-image", inputTokens: 95, outputTokens: 0, imageCount: 1, costCents: 28, createdAt: iso(2 * DAY) },
  { id: "ur-5", userId: "u-admin", modelId: "m-gpt5", modelName: "GPT-5.2", conversationId: "c-proj-1", inputTokens: 2100, outputTokens: 350, costCents: 9, createdAt: iso(2 * HOUR) },
  { id: "ur-6", userId: "u-admin", modelId: "m-deepseek", modelName: "DeepSeek V4", conversationId: "c-old-1", inputTokens: 30, outputTokens: 280, costCents: 1, createdAt: iso(6 * DAY) },
];

export const mockLedger: LedgerEntry[] = [
  { id: "lg-1", userId: "u-admin", amountCents: 10000, balanceAfterCents: 10000, reason: "recharge", description: "充值 ¥100", createdAt: iso(10 * DAY) },
  { id: "lg-2", userId: "u-admin", amountCents: 5000, balanceAfterCents: 15000, reason: "redeem", description: "兑换码 NEWYEAR2026", createdAt: iso(8 * DAY) },
  { id: "lg-3", userId: "u-admin", amountCents: -18, balanceAfterCents: 14982, reason: "usage", description: "GPT-5.2 对话消费", createdAt: iso(22 * HOUR) },
  { id: "lg-4", userId: "u-admin", amountCents: -28, balanceAfterCents: 14954, reason: "usage", description: "GPT Image 2 生图", createdAt: iso(2 * DAY) },
  { id: "lg-5", userId: "u-admin", amountCents: -2104, balanceAfterCents: 12850, reason: "usage", description: "本周对话消费合计", createdAt: iso(1 * HOUR) },
];

// ---------- 设置 ----------

export const mockSettings: AppSettings = {
  siteName: "LinHub",
  visionHelperModelId: "m-gemini",
  toolRouterModelId: "m-gemini",
  embeddingModelId: "m-glm",
  tavilyApiKeyMasked: "tvly-...8xKq",
  mimoApiKeyMasked: "mm-...t7Rd",
  mimoTtsVoice: "warm-female",
  skillMarketRequiresReview: true,
  registrationEnabled: true,
};

// ---------- 新会话建议提示词 ----------

export const suggestedPrompts = [
  { icon: "✍️", title: "帮我写作", prompt: "帮我写一篇关于远程办公利弊的短文，语气轻松一点。" },
  { icon: "🔍", title: "联网调研", prompt: "搜索一下本周 AI 领域的重要新闻，给我一份摘要。" },
  { icon: "💻", title: "写个小工具", prompt: "做一个番茄钟网页应用，要有漂亮的圆环倒计时动画。" },
  { icon: "🎨", title: "画张图", prompt: "画一只在星空下弹吉他的柴犬，水彩风格。" },
  { icon: "📚", title: "解释概念", prompt: "用通俗的比喻解释什么是 Transformer 注意力机制。" },
  { icon: "🧮", title: "跑段代码", prompt: "用 Python 模拟蒙特卡洛方法估算圆周率，画出收敛过程。" },
];

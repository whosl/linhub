# LinHub 测试知识库文档

## 产品简介
LinHub 是一个多模型 AI 助手 Web 应用，支持 OpenAI、Anthropic、Google、DeepSeek 等多家供应商的模型。

## 核心功能
1. **多模型对话**：支持 GPT、Claude、Gemini 等模型的文本对话
2. **图片生成与编辑**：通过工具调用实现文生图和图片编辑
3. **Artifacts**：生成可预览的 HTML/React/SVG 代码作品
4. **知识库 RAG**：上传文档后模型可检索引用
5. **MCP 工具集成**：支持自定义 MCP 服务器

## 技术栈
- Next.js 16 + React 19 + TypeScript
- Drizzle ORM + PostgreSQL with pgvector
- Vercel AI SDK v7

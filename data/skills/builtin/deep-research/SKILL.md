---
name: deep-research
description: 对需要多来源检索、并行研究、事实核验、来源评级和引用报告的复杂问题开展深度调研。用户要求深度调研、行业研究、竞品研究、政策追踪、趋势分析、尽调、带引用报告或最新资料核验时使用；简单事实查询、普通写作和闲聊不要使用。
license: Proprietary
compatibility: Requires LinHub Skill Run worker, approved web search/read MCP capabilities, and a tool-capable chat model.
metadata:
  author: LinHub
  version: "1.0.0"
  category: research
allowed-tools: web_search web_read web_crawl
---

# 深度调研

将用户问题转成可验证的研究任务，使用结构化进度和证据完成报告。不要展示原始思维过程。

## 工作流

1. 判断快速调研或深度调研。快速调研使用单一路径和 3–6 个来源；深度调研拆成 3–6 个互不重复的子任务。
2. 明确范围、时间、地区、受众和交付格式。只有缺失信息会实质改变结论时才暂停并提问。
3. 按 [来源策略](references/source-policy.md) 选择中文搜索、外文搜索和页面读取能力。
4. 让每个 Subagent 只处理一个研究维度，并返回结论、证据、来源 URL、发布日期和不确定性。
5. 合并重复来源，优先原始资料，标记相互冲突的信息并进行交叉核验。
6. 生成带行内引用的报告。区分事实、推断和建议，说明数据截止日期与研究限制。

## 交付要求

- 报告先给结论摘要，再给证据和分析。
- 关键事实必须能追溯到来源，不得伪造 URL、标题或发布日期。
- 同一事实不要堆叠多个转载来源。
- 来源失败时按既定 fallback 执行；证据不足时明确写“尚无充分证据”。
- 信息流只展示计划、子任务、来源数、核验和写作阶段，不展示 chain-of-thought。

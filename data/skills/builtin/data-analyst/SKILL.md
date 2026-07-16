---
name: data-analyst
description: 对用户上传的 CSV、TSV、XLSX 或 XLS 表格执行数据质量检查、描述统计、趋势与异常分析，并生成图表、清洗数据、可复现代码和分析报告；需要外部数据时按中文智谱、外文 Tavily、页面读取智谱优先的策略补充来源。用户要求分析表格、检查数据质量、制作图表、提炼指标、解释趋势、清洗数据或生成数据报告时使用；普通算术、没有数据的泛泛咨询和只需联网研究的问题不要使用。
license: Proprietary
compatibility: Requires LinHub Skill Run worker, spreadsheet parser, gVisor Code Sandbox, and a tool-capable chat model.
metadata:
  author: LinHub
  version: "1.0.0"
  category: data
allowed-tools: start_data_analysis analyze_spreadsheet run_code create_artifact web_search web_read web_crawl
---

# 数据分析师

把数据分析做成可恢复、可复现的交付流程。优先分析用户已有数据，不要默认联网。

## 工作流

1. 明确问题、指标口径、时间范围和期望交付物。只有缺失信息会改变分析方法时才提问。
2. 用 `analyze_spreadsheet` 检查文件结构、列名、sheet、样例和基础统计。
3. 对完整分析调用 `start_data_analysis`，传入数据附件 id、问题以及是否明确需要外部数据。
4. 在沙盒中完成缺失值、重复值、类型、分布和异常检查；保留可复现代码。
5. 将描述性结论与因果解释分开。样本被截断、口径不一致或证据不足时必须标注。
6. 交付 Markdown 报告、HTML 预览、profile JSON、图表、清洗 CSV 和 Python 代码。

## 外部数据规则

- 本地文件分析默认 `needsExternalData=false`，不得为了丰富回答自动联网。
- 用户明确要求行业基准、补充公开数据或最新背景时，才设置 `needsExternalData=true`。
- 中文与中国来源优先智谱搜索；外文与国际来源优先 Tavily；页面读取优先智谱，失败后 Tavily extract/crawl。
- 外部事实必须保留 URL 和日期，并与本地数据发现分节呈现。

详细方法见 [分析方法](references/analysis-methods.md)，图表选择见 [图表选择](references/chart-selection.md)。

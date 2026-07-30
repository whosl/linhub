---
name: ppt-studio
description: 通过信息流中的结构化需求卡收集主题、受众、页数、视觉主题、媒体偏好、语言和输出格式，再使用已安装的 Dashi PPT 版式运行时生成可编辑 PPTX 或浏览器可编辑 HTML 演示文稿。用户要求制作、生成、设计、改写或重做 PPT/演示文稿/幻灯片时使用；只需读取或总结现有 PPTX 时使用原生 PPTX 工具而不要启动工作室。
license: Proprietary
compatibility: Requires LinHub Skill Run worker and the separately installed Dashi PPT v0.4.0 AGPL runtime.
metadata:
  author: LinHub
  version: "1.0.0"
  category: presentation
allowed-tools: start_ppt_studio
---

# PPT 工作室

先收集结构化需求，再异步规划、选版、填充、校验和渲染。不要跳过用户确认直接生成。

## 工作流

1. 调用 `start_ppt_studio`，只传入已知主题；不要在聊天正文重复询问所有字段。
2. 等待用户在信息流卡片中提交受众、页数、主题、媒体偏好、语言和输出格式。
3. worker 将任务拆为大纲、版式匹配、页面内容和渲染阶段；任务可刷新恢复、停止和重试。
4. 每页只表达一个主要信息角色；封面只用主题前 5 个版式之一，正文使用第 6 页以后版式，整份 deck 不重复 layout。
5. 严格按 Dashi `fillPlan`、`propShapes` 和长度预算填写 props，不保留示例文案，不写私有样式字段。
6. 只有任务卡出现下载附件后才声称文件已生成。

主题选择说明见 [Dashi 主题适配](references/theme-guide.md)。需求卡字段定义见 [brief-schema.json](assets/brief-schema.json)。

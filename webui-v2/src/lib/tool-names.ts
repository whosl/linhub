// 工具名 → 中文显示名映射(纯函数,不依赖 React,可单测)

const TOOL_NAME_MAP: Record<string, string> = {
  web_search: "联网搜索",
  web_read: "读取网页",
  generate_image: "生成图片",
  edit_image: "编辑图片",
  analyze_image: "分析图片",
  run_code: "运行代码",
  save_memory: "保存记忆",
  search_memory: "搜索记忆",
  search_knowledge: "搜索知识库",
  create_artifact: "创建 Artifact",
  update_artifact: "更新 Artifact",
};

/** 工具显示名:内置工具映射为中文;tavily_* 统一显示 Tavily;其余(MCP)原样 */
export function toolDisplayName(toolName: string): string {
  if (TOOL_NAME_MAP[toolName]) return TOOL_NAME_MAP[toolName];
  if (toolName.startsWith("tavily_") || toolName === "tavily") return "Tavily";
  return toolName;
}

/** 工具图标(emoji,保持依赖最小) */
export function toolIcon(toolName: string): string {
  if (toolName === "web_search" || toolName.startsWith("tavily_")) return "🔎";
  if (toolName === "web_read") return "📄";
  if (toolName === "generate_image" || toolName === "edit_image") return "🎨";
  if (toolName === "analyze_image") return "🖼️";
  if (toolName === "run_code") return "⚡";
  if (toolName === "save_memory" || toolName === "search_memory") return "🧠";
  if (toolName === "search_knowledge") return "📚";
  if (toolName === "create_artifact" || toolName === "update_artifact") return "🧩";
  return "🔧";
}

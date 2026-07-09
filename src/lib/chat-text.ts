/**
 * 聊天 UI 文本清洗：推理摘要 / 工具参数预览等展示层用。
 */

/** 去掉模型/网关偶发塞进推理摘要的 HTML 注释（如 <!-- -->） */
export function stripHtmlComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 反转义 JSON 字符串片段里的 \\n / \\t / \\" 等 */
export function unescapeJsonStringFragment(value: string): string {
  return value.replace(/\\([nrt"\\/bf])/g, (_, ch: string) => {
    switch (ch) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case '"':
        return '"';
      case "\\":
        return "\\";
      case "/":
        return "/";
      case "b":
        return "\b";
      case "f":
        return "\f";
      default:
        return ch;
    }
  });
}

/** 工具卡片单行预览：反转义后把换行压成空格，避免字面量 \\n */
export function formatToolPreviewLabel(value: string): string {
  return unescapeJsonStringFragment(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

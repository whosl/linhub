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

const REASONING_NOISE_HEADING_RE =
  /^\*\*(?:Planning|Preparing|Requesting|Retrying|Explaining|Analyzing|Considering|Checking|Reviewing|Reading|Correcting|Inspecting|Investigating|Calling|Invoking|Using|Trying)\b[^*]{0,180}\*\*$/i;

const TOOL_SCRATCHPAD_RE =
  /(<\|?json\|?>|<\/?\|?json\|?>|<\/?tool_call>|functions\.[a-z0-9_.-]+|namespace usage|tool invocation|recipient requirement|"searchDepth"\s*:|"query"\s*:|^\s*\{[\s\S]{0,260}"(?:query|searchDepth|tool|name|arguments)"\s*:)/i;

/**
 * 清洗推理展示文本。
 *
 * 一些 OpenAI 兼容中转会把模型内部的工具调用草稿、函数调用纠错日志也塞进
 * reasoning_content，例如 `<|json|>{"query":...}`、`<tool_call>...`。
 * 这些不是用户可读的“深度思考”，更接近协议中间态；展示出来会显得很脏。
 */
export function sanitizeReasoningText(text: string): string {
  const withoutComments = stripHtmlComments(text)
    .replace(/<\|?json\|?>/gi, "\n")
    .replace(/<\/?\|?json\|?>/gi, "\n")
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "\n")
    .replace(/<tool_call>[\s\S]*$/gi, "\n");

  const lines = withoutComments
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !REASONING_NOISE_HEADING_RE.test(line))
    .filter((line) => !TOOL_SCRATCHPAD_RE.test(line))
    .map((line) =>
      line
        .replace(/\s*\{[^{}]{0,260}"(?:query|searchDepth)"\s*:[^{}]*\}\s*/gi, "")
        .trim()
    )
    .filter(Boolean);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const TOOL_JSON_OBJECT_RE =
  /\s*\{\\?"query\\?"\s*:\s*\\?"[^{}\n]{1,240}\\?"\s*,\s*\\?"searchDepth\\?"\s*:\s*\\?"[^{}\n]{1,40}\\?"\s*\}\s*/gi;

const TOOL_RECIPIENT_CALL_RE =
  /<\|recipient=functions\.[^|]{1,120}\|>\s*\{[^{}\n]{0,500}\}/gi;

const TOOL_FUNCTION_BLOCK_RE =
  /<functions\.([a-z0-9_.-]+)(?:\s+[^<>]*)?\s*>\s*(?:\{[\s\S]*?\})?\s*<\/functions\.\1\s*>/gi;

const TOOL_FUNCTION_OPEN_JSON_RE =
  /<functions\.[a-z0-9_.-]+(?:\s+[^<>]*)?\s*>\s*\{[^{}\n]{0,1000}\}/gi;

const TOOL_FUNCTION_TAG_RE =
  /<\/?functions\.[a-z0-9_.-]+(?:\s+[^<>]*)?\s*\/?>/gi;

/**
 * 清洗模型正文里的协议草稿。
 *
 * 只处理很窄的工具调用痕迹：`<|json|>{...}`、`<tool_call>{...}`、
 * `{"query":...,"searchDepth":...}`。不碰普通代码块和一般 JSON，避免误伤。
 */
export function sanitizeAssistantText(text: string): string {
  const withoutBlocks = text
    .replace(/<tool_call>\s*\{[\s\S]*?\}\s*<\/tool_call>/gi, "\n")
    .replace(TOOL_RECIPIENT_CALL_RE, "\n")
    .replace(TOOL_FUNCTION_BLOCK_RE, "\n")
    .replace(TOOL_FUNCTION_OPEN_JSON_RE, "\n")
    .replace(TOOL_FUNCTION_TAG_RE, "\n")
    .replace(/<\|?json\|?>/gi, "\n");

  return withoutBlocks
    .split(/\r?\n/)
    .map((line) => line.replace(TOOL_JSON_OBJECT_RE, "").trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n")
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

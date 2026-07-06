/**
 * 把上游服务错误压成可给用户看的中文提示。
 * 目标是保留状态码与少量 JSON/plaintext 细节，但绝不把 HTML 错误页原样吐给前端。
 */
export async function formatUpstreamError(
  res: Response,
  fallback: string
): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text().catch(() => "");
  const detail = extractSafeDetail(raw, contentType);
  const prefix = `${fallback}（${res.status}）`;
  return detail ? `${prefix}: ${detail}` : `${prefix}，请检查服务配置或稍后重试`;
}

function extractSafeDetail(raw: string, contentType: string): string {
  const text = raw.trim();
  if (!text) return "";

  if (contentType.includes("json") || looksLikeJson(text)) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const message = pickJsonMessage(parsed);
      return cleanup(message).slice(0, 240);
    } catch {
      return "";
    }
  }

  if (contentType.includes("html") || looksLikeHtml(text)) return "";
  return cleanup(text).slice(0, 240);
}

function looksLikeJson(text: string) {
  return text.startsWith("{") || text.startsWith("[");
}

function looksLikeHtml(text: string) {
  return /<!doctype html|<html[\s>]|<body[\s>]|<\/[a-z][\s\S]*>/i.test(text);
}

function pickJsonMessage(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  const candidates = [
    obj.message,
    obj.error_description,
    obj.error,
    typeof obj.error === "object" && obj.error
      ? (obj.error as Record<string, unknown>).message
      : undefined,
  ];
  const found = candidates.find((v) => typeof v === "string" && v.trim());
  return typeof found === "string" ? found : "";
}

function cleanup(text: string) {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

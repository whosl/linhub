/** className 合并工具(简单拼接,保持依赖最小) */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

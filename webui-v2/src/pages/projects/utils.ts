// 项目页通用工具:相对时间、文件大小、预设颜色

/** 相对时间(中文):刚刚 / N 分钟前 / N 小时前 / N 天前 / N 个月前 / N 年前 */
export function formatRelativeTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const diff = Date.now() - time;
  if (diff < 0) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

/** 文件大小:B / KB / MB / GB,保留一位小数(KB 起) */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** 新建/编辑项目的预设颜色(暖色系,深浅色主题均可读) */
export const PROJECT_COLORS = [
  "#c96442", // 陶土橙(主色)
  "#d98e32", // 琥珀
  "#7a9e43", // 苔绿
  "#3f8f7a", // 青绿
  "#4a7fb5", // 灰蓝
  "#8b6bb8", // 藕紫
] as const;

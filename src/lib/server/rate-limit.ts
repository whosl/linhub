/**
 * H6：进程内滑动窗口限频（单实例部署适用；多实例时换 Redis 实现）。
 * 用法：const err = rateLimit(`chat:${userId}`, 20, 60_000); if (err) return err;
 */
const buckets = new Map<string, number[]>();

let lastSweep = Date.now();

function sweep(now: number) {
  // 每分钟清理一次过期 bucket，防内存膨胀
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, times] of buckets) {
    if (times.length === 0 || times[times.length - 1] < now - 10 * 60_000) {
      buckets.delete(key);
    }
  }
}

/** 命中限频时返回 429 Response，否则返回 null */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): Response | null {
  const now = Date.now();
  sweep(now);
  const times = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (times.length >= max) {
    buckets.set(key, times);
    return Response.json(
      { error: "操作过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } }
    );
  }
  times.push(now);
  buckets.set(key, times);
  return null;
}

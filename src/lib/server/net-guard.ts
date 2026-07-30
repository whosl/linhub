import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF 防护：校验用户提供的 URL 是否可以安全地由服务端发起请求。
 * 拒绝非 http(s) 协议、回环、私有网段、链路本地（云元数据）地址。
 * 开发模式（NODE_ENV !== production 或显式开启）放行 localhost 便于本地调试。
 */
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL 格式无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持 http/https 协议");
  }

  // 生产环境一律禁止本机/内网，即使 ALLOW_LOCAL_MCP=true
  const allowLocal = process.env.NODE_ENV !== "production";

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isLocalHostname(hostname)) {
    if (allowLocal) return;
    throw new Error("不允许访问本机地址");
  }

  // 域名解析后校验所有 IP（防 DNS 指向内网）
  const ips: string[] = [];
  if (isIP(hostname)) {
    ips.push(hostname);
  } else {
    try {
      const results = await lookup(hostname, { all: true });
      ips.push(...results.map((r) => r.address));
    } catch {
      throw new Error("域名解析失败");
    }
  }
  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      if (allowLocal && (ip === "127.0.0.1" || ip === "::1")) continue;
      throw new Error("不允许访问内网地址");
    }
  }
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local");
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7)); // IPv4 映射
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fe80:") || // 链路本地
      lower.startsWith("fc") || // ULA fc00::/7
      lower.startsWith("fd")
    );
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // 链路本地/云元数据
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // 组播/保留
  );
}

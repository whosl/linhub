import { NextResponse, type NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";

/**
 * API 反向代理:把 /api、/uploads、/generated 转发到后端,
 * 同时把 Origin/Referer 改写为后端地址 —— better-auth 会校验 Origin,
 * 浏览器发出的是 localhost:3100,不改写会被 403 Invalid origin 拒绝。
 */
export function proxy(req: NextRequest) {
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, BACKEND_URL);
  const headers = new Headers(req.headers);
  headers.set("origin", BACKEND_URL);
  headers.set("referer", `${BACKEND_URL}/`);
  // host 由 fetch 按目标 URL 自动设置,删掉浏览器侧的 localhost host
  headers.delete("host");
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/api/:path*", "/uploads/:path*", "/generated/:path*"],
};

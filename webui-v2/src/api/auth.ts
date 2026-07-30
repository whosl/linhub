import { request, setToken } from "./http";
import type { User } from "./types";

interface AuthResponse {
  user?: User;
}

/**
 * 从响应头 set-auth-token 读取 bearer token(better-auth bearer 插件)。
 * 这里需要直接拿到 Response,因此不经过 request() 的封装返回。
 */
async function authRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<User | null> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });

  if (!res.ok) {
    let message = `请求失败(${res.status})`;
    try {
      const data = (await res.json()) as {
        error?: unknown;
        message?: unknown;
      };
      if (typeof data?.error === "string" && data.error) {
        message = data.error;
      } else if (typeof data?.message === "string" && data.message) {
        message = data.message;
      }
    } catch {
      // 忽略非 JSON 响应
    }
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const token = res.headers.get("set-auth-token");
  if (token) {
    setToken(token);
  }

  const data = (await res.json()) as AuthResponse;
  return data.user ?? null;
}

/** 邮箱密码登录 */
export async function signIn(email: string, password: string): Promise<User | null> {
  return authRequest("/api/auth/sign-in/email", { email, password });
}

/** 注册(密码至少 8 位) */
export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<User | null> {
  return authRequest("/api/auth/sign-up/email", { name, email, password });
}

/** 登出:通知后端失效会话,再清本地 token */
export async function signOut(): Promise<void> {
  try {
    await request("/api/auth/sign-out", { method: "POST", body: {} });
  } finally {
    setToken(null);
  }
}

/** 获取当前用户;未登录返回 null */
export async function getMe(): Promise<User | null> {
  return request<User | null>("/api/me", { silent401: true });
}

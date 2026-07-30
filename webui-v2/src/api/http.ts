// fetch 封装:自动携带 Bearer token、统一错误、超时、401 处理

const TOKEN_KEY = "linhub-v2-token";
const DEFAULT_TIMEOUT_MS = 20_000;

/** 401 事件名:token 失效时广播,由上层(App)监听并跳转 /login */
export const UNAUTHORIZED_EVENT = "linhub:unauthorized";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface BaseOptions {
  timeoutMs?: number;
  /** 静默 401:不清 token 不广播(用于登录本身等场景) */
  silent401?: boolean;
  /** 追加自定义请求头(如 Idempotency-Key) */
  headers?: Record<string, string>;
}

interface RequestOptions extends BaseOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

/**
 * 带鉴权的底层 fetch:
 * - 自动加 Authorization: Bearer
 * - 超时 AbortController
 * - 非 2xx 时解析 { error | message } 抛 ApiError
 * - 401(非静默)清 token 并广播事件,由上层跳转登录页
 */
async function fetchWithAuth(
  path: string,
  init: { method: string; body?: BodyInit; headers?: Record<string, string> },
  options: BaseOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, silent401, headers: extra } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { ...init.headers, ...extra };
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method,
      headers,
      body: init.body,
      signal: controller.signal,
      credentials: "include",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "请求超时,请稍后重试");
    }
    throw new ApiError(0, "网络错误,请检查连接后重试");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `请求失败(${res.status})`;
    try {
      const data = (await res.json()) as { error?: unknown; message?: unknown };
      if (typeof data?.error === "string" && data.error) {
        message = data.error;
      } else if (typeof data?.message === "string" && data.message) {
        message = data.message;
      }
    } catch {
      // 响应体非 JSON,保留默认信息
    }
    if (res.status === 401 && !silent401) {
      setToken(null);
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, message);
  }

  return res;
}

/** 解析 JSON 响应(204 / 空响应返回 undefined) */
async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/** 统一 JSON 请求入口 */
export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, ...rest } = options;
  const res = await fetchWithAuth(
    path,
    {
      method,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    rest,
  );
  return parseJson<T>(res);
}

/** multipart/form-data 请求(上传文件;Content-Type 由浏览器带 boundary 自动设置) */
export async function requestForm<T = unknown>(
  path: string,
  options: BaseOptions & {
    method?: "POST" | "PUT" | "PATCH";
    formData: FormData;
  },
): Promise<T> {
  const { method = "POST", formData, ...rest } = options;
  const res = await fetchWithAuth(path, { method, body: formData }, rest);
  return parseJson<T>(res);
}

/** 返回二进制 Blob 的请求(如 TTS 音频) */
export async function requestBlob(
  path: string,
  options: RequestOptions = {},
): Promise<Blob> {
  const { method = "POST", body, ...rest } = options;
  const res = await fetchWithAuth(
    path,
    {
      method,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    rest,
  );
  return res.blob();
}

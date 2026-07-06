import { NextRequest } from "next/server";
import { z } from "zod";

/**
 * I1: 统一的请求体校验工具。
 *
 * 用法：
 *   const parsed = parseBody(req, MySchema);
 *   if (parsed instanceof Response) return parsed;  // 校验失败，直接返回 400
 *   // 否则 parsed 为 z.infer<typeof MySchema>
 *
 * 返回 Response（而非抛错）是为了与项目里 requireSession/requireAdmin 的
 * `.catch(() => null)` 模式一致，避免依赖每个调用点都包 try/catch。
 */
export async function parseBody<T>(
  req: NextRequest,
  schema: z.ZodType<T>
): Promise<T | Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON" }, { status: 400 });
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return Response.json(
      { error: "参数校验失败", issues: result.error.issues },
      { status: 400 }
    );
  }
  return result.data;
}

/** 校验失败时从 parseBody 的返回值里取出 Response；成功则取出数据。 */
export function isValidationResponse(v: unknown): v is Response {
  return v instanceof Response;
}

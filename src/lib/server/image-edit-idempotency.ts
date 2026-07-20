import { createHmac } from "node:crypto";

const OPERATION_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const inFlight = new Map<string, Promise<unknown>>();

export function normalizeImageEditOperationKey(raw: string | null) {
  const value = raw?.trim() ?? "";
  return OPERATION_KEY_RE.test(value) ? value : null;
}

/** 同一用户和操作键跨进程重启仍映射到相同私有媒体 id。 */
export function imageEditAssetId(userId: string, operationKey: string) {
  const secret = process.env.ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("服务端缺少图片编辑幂等密钥");
  const digest = createHmac("sha256", secret)
    .update(userId)
    .update("\0")
    .update(operationKey)
    .digest("hex")
    .slice(0, 24);
  return `med-edit-${digest}`;
}

/** 单实例内相同操作共享一次上游请求；固定媒体 id 负责跨重启重放。 */
export async function runImageEditSingleFlight<T>(
  operationId: string,
  run: () => Promise<T>
): Promise<T> {
  const existing = inFlight.get(operationId) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = run();
  inFlight.set(operationId, pending);
  try {
    return await pending;
  } finally {
    if (inFlight.get(operationId) === pending) inFlight.delete(operationId);
  }
}

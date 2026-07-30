import "server-only";
import { createHash } from "node:crypto";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function isValidIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(value);
}

/**
 * 同一用户与同一客户端操作键稳定映射到同一个商户订单号。用户 ID 参与哈希，避免
 * 不同账户复用相同客户端键时互相碰撞；保留 96 bit，强度高于项目旧 48 bit 随机 ID。
 */
export function idempotentOrderId(userId: string, key: string): string {
  const digest = createHash("sha256")
    .update(userId)
    .update("\0")
    .update(key)
    .digest("hex")
    .slice(0, 24);
  return `ord-${digest}`;
}

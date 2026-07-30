// 计费(Billing)API:用量明细 / 余额流水 / 套餐 / 下单 / 兑换码
import { request } from "./http";

export interface UsageRecord {
  id: string;
  userId: string;
  capability?: string;
  modelId: string;
  modelName: string;
  conversationId?: string;
  inputTokens: number;
  outputTokens: number;
  imageCount?: number;
  /** 整数分 */
  costCents: number;
  createdAt: string;
}

export type LedgerReason = "recharge" | "usage" | "grant" | "refund" | "redeem";

export interface LedgerEntry {
  id: string;
  userId: string;
  /** 正为充值/入账,负为消费,整数分 */
  amountCents: number;
  balanceAfterCents: number;
  reason: LedgerReason;
  description: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  /** 整数分 / 月 */
  priceCentsPerMonth: number;
  /** -1 表示无限 */
  monthlyQuotaCents: number;
  modelTier: "free" | "pro";
  features: string[];
  enabled: boolean;
}

export interface Order {
  id: string;
  userId: string;
  kind: "recharge" | "subscription";
  /** 整数分 */
  amountCents: number;
  planId?: string;
  status: "pending" | "paid" | "failed" | "cancelled";
  channel: string;
  createdAt: string;
  paidAt?: string;
  /** 存在时需新窗口打开完成支付 */
  payUrl?: string;
}

export interface CreateOrderInput {
  kind: "recharge" | "subscription";
  /** recharge 必填,整数分 */
  amountCents?: number;
  /** subscription 必填 */
  planId?: string;
}

export const billingKeys = {
  usage: ["billing", "usage"] as const,
  ledger: ["billing", "ledger"] as const,
  plans: ["billing", "plans"] as const,
};

export function getUsage(): Promise<UsageRecord[]> {
  return request<UsageRecord[]>("/api/usage");
}

export function getLedger(): Promise<LedgerEntry[]> {
  return request<LedgerEntry[]>("/api/ledger");
}

export function getPlans(): Promise<Plan[]> {
  return request<Plan[]>("/api/plans");
}

/** 创建订单;每次调用生成新的幂等键,防止重复点击产生重复订单 */
export function createOrder(input: CreateOrderInput): Promise<Order> {
  return request<Order>("/api/orders", {
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": `web-${crypto.randomUUID()}` },
  });
}

export function redeemCode(code: string): Promise<{ amountCents: number }> {
  return request<{ amountCents: number }>("/api/redeem", {
    method: "POST",
    body: { code },
  });
}

/** 整数分 → ¥ 显示(如 1234 → "¥12.34") */
export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

/** ISO 时间 → 本地短格式(如 07/22 18:24) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

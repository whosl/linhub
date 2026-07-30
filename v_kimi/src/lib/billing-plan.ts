export const UNLIMITED_QUOTA_CENTS = -1;

export function isUnlimitedQuota(cents?: number | null) {
  return typeof cents === "number" && cents < 0;
}

export function formatQuotaCents(cents: number) {
  if (isUnlimitedQuota(cents)) return "无限";
  return `¥${(cents / 100).toFixed(2)}`;
}

/**
 * H7：启动时校验必需环境变量，漏配时直接报错退出，
 * 避免运行到一半才 500 或落入不安全的 fallback。
 */
const REQUIRED = ["DATABASE_URL", "BETTER_AUTH_SECRET", "ENCRYPTION_KEY"] as const;

let checked = false;

export function assertEnv() {
  if (checked) return;
  checked = true;
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `缺少必需环境变量：${missing.join(", ")}。请参考 .env.example 配置后重启。`
    );
  }
  if ((process.env.ENCRYPTION_KEY ?? "").length < 32) {
    throw new Error("ENCRYPTION_KEY 长度必须至少 32 字符（AES-256 密钥）");
  }
}

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";

/** 解析 MiMo（小米）语音配置：
 *  优先 settings 里的专用 key，回退 xiaomi-token-plan，再兼容旧 xiaomi 供应商 key。
 *  ASR/TTS 走 token-plan 端点（与对话模型的 xiaomi 端点独立）。 */
export async function getMimoConfig() {
  const [s] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"));

  let apiKey = s?.mimoApiKeyEncrypted ? decryptSecret(s.mimoApiKeyEncrypted) : null;
  let baseURL = "https://token-plan-cn.xiaomimimo.com/v1";

  // 回退到 xiaomi-token-plan 供应商的 key + baseUrl
  const [tp] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.kind, "xiaomi-token-plan"));
  if (!apiKey && tp?.apiKeyEncrypted) {
    apiKey = decryptSecret(tp.apiKeyEncrypted);
  }
  if (tp?.baseUrl) baseURL = tp.baseUrl;

  // 兼容旧部署：之前语音配置回退到 xiaomi 供应商 key。
  // 这里仅复用 key；默认仍走 token-plan 端点，避免把 ASR/TTS 发到对话模型网关。
  const [legacyXiaomi] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.kind, "xiaomi"));
  if (!apiKey && legacyXiaomi?.apiKeyEncrypted) {
    apiKey = decryptSecret(legacyXiaomi.apiKeyEncrypted);
  }

  if (!apiKey) throw new Error("管理员尚未配置 MiMo API Key");
  // 有效音色：mimo_default / 冰糖 / 茉莉 / 苏打 / 白桦 / Mia / Chloe / Milo / Dean
  return { apiKey, baseURL, voice: s?.mimoTtsVoice || "mimo_default" };
}

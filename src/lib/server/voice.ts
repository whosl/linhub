import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/crypto";

/** 解析 MiMo（小米）语音配置：优先 settings 里的专用 key，回退 xiaomi 供应商 key */
export async function getMimoConfig() {
  const [s] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"));

  let apiKey = s?.mimoApiKeyEncrypted ? decryptSecret(s.mimoApiKeyEncrypted) : null;
  let baseURL = "https://api.xiaomimimo.com/v1";

  const [xiaomi] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.kind, "xiaomi"));
  if (!apiKey && xiaomi?.apiKeyEncrypted) {
    apiKey = decryptSecret(xiaomi.apiKeyEncrypted);
  }
  if (xiaomi?.baseUrl) baseURL = xiaomi.baseUrl;

  if (!apiKey) throw new Error("管理员尚未配置 MiMo API Key");
  return { apiKey, baseURL, voice: s?.mimoTtsVoice || "default" };
}

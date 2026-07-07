import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";
import { decryptSecret } from "@/lib/server/crypto";
import { ensureSeeded } from "@/lib/server/seed";
import { formatUpstreamError } from "@/lib/server/upstream-error";
import { assertSafeUrl } from "@/lib/server/net-guard";
import { getProviderBaseURL } from "@/lib/server/llm/registry";

export const maxDuration = 120;

type Engine = "image" | "tts" | "asr" | "search";

interface EngineConfigPatch {
  baseUrl?: string;
  model?: string;
  voice?: string;
  apiKey?: string;
}

const TEST_TIMEOUT_MS = 60_000;
const IMAGE_TEST_TIMEOUT_MS = 120_000;

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const ok = await requireAdmin().catch(() => null);
  if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = (await req.json()) as {
      engine?: unknown;
      config?: unknown;
    };
    const engine = body.engine;
    if (!isEngine(engine)) {
      return Response.json({ ok: false, error: "未知引擎类型" });
    }
    const config = normalizeConfig(body.config);

    switch (engine) {
      case "image":
        await testImageEngine(config);
        return Response.json({
          ok: true,
          message: "图像生成连接成功（已生成 1 张测试图）",
        });
      case "tts":
        await testTtsEngine(config);
        return Response.json({ ok: true, message: "TTS 连接成功" });
      case "asr":
        await testAsrEngine(config);
        return Response.json({ ok: true, message: "ASR 连接成功" });
      case "search":
        await testSearchEngine(config);
        return Response.json({ ok: true, message: "联网搜索连接成功" });
    }
  } catch (e) {
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : "测试失败",
    });
  }
}

function isEngine(value: unknown): value is Engine {
  return value === "image" || value === "tts" || value === "asr" || value === "search";
}

function normalizeConfig(value: unknown): EngineConfigPatch {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    baseUrl: cleanString(record.baseUrl),
    model: cleanString(record.model),
    voice: cleanString(record.voice),
    apiKey: cleanString(record.apiKey),
  };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

async function getSettings() {
  const [settings] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, "global"))
    .limit(1);
  if (!settings) throw new Error("设置未初始化");
  return settings;
}

async function getProviderSecret(kind: typeof schema.providers.$inferSelect.kind) {
  const [provider] = await db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.kind, kind))
    .limit(1);
  return {
    apiKey: provider?.apiKeyEncrypted ? decryptSecret(provider.apiKeyEncrypted) : undefined,
    baseURL: provider ? getProviderBaseURL(provider) : undefined,
  };
}

async function getMimoFallback() {
  const tokenPlan = await getProviderSecret("xiaomi-token-plan");
  const legacy = await getProviderSecret("xiaomi");
  return {
    apiKey: tokenPlan.apiKey ?? legacy.apiKey,
    baseURL: tokenPlan.baseURL ?? legacy.baseURL ?? "https://token-plan-cn.xiaomimimo.com/v1",
  };
}

async function getImageFallback() {
  const rows = await db
    .select({ model: schema.models, provider: schema.providers })
    .from(schema.models)
    .innerJoin(schema.providers, eq(schema.models.providerId, schema.providers.id))
    .where(eq(schema.models.enabled, true));
  const found = rows.find((row) =>
    (row.model.capabilities as string[]).includes("image-generation")
  );
  return {
    apiKey: found?.provider.apiKeyEncrypted
      ? decryptSecret(found.provider.apiKeyEncrypted)
      : undefined,
    baseURL: found ? getProviderBaseURL(found.provider) : undefined,
    model: found?.model.slug,
  };
}

async function testImageEngine(config: EngineConfigPatch) {
  const settings = await getSettings();
  const fallback = await getImageFallback();
  const apiKey =
    config.apiKey ||
    (settings.imageGenApiKeyEncrypted
      ? decryptSecret(settings.imageGenApiKeyEncrypted)
      : undefined) ||
    fallback.apiKey;
  if (!apiKey) throw new Error("图像生成 API Key 未配置");

  const baseURL = stripTrailingSlash(
    config.baseUrl || settings.imageGenBaseUrl || fallback.baseURL || "https://api.openai.com/v1"
  );
  const model = config.model || settings.imageGenModel || fallback.model;
  if (!model) throw new Error("图像生成模型未配置");

  const url = `${baseURL}/images/generations`;
  await assertSafeUrl(url);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: "A simple red square icon on a white background.",
      size: "1024x1024",
      n: 1,
    }),
    signal: AbortSignal.timeout(IMAGE_TEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(await formatUpstreamError(res, "生图测试失败"));
}

async function testTtsEngine(config: EngineConfigPatch) {
  const settings = await getSettings();
  const fallback = await getMimoFallback();
  const apiKey =
    config.apiKey ||
    (settings.ttsApiKeyEncrypted ? decryptSecret(settings.ttsApiKeyEncrypted) : undefined) ||
    (settings.mimoApiKeyEncrypted ? decryptSecret(settings.mimoApiKeyEncrypted) : undefined) ||
    fallback.apiKey;
  if (!apiKey) throw new Error("TTS API Key 未配置");

  const baseURL = stripTrailingSlash(config.baseUrl || settings.ttsBaseUrl || fallback.baseURL);
  const model = config.model || settings.ttsModel || "mimo-v2.5-tts";
  const voice = config.voice || settings.mimoTtsVoice || "冰糖";
  const url = `${baseURL}/chat/completions`;
  await assertSafeUrl(url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: "" },
        { role: "assistant", content: "连接测试" },
      ],
      audio: { format: "mp3", voice },
    }),
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(await formatUpstreamError(res, "TTS 测试失败"));
  const data = (await res.json()) as {
    choices?: { message?: { audio?: { data?: string } } }[];
  };
  if (!data.choices?.[0]?.message?.audio?.data) {
    throw new Error("TTS 测试失败：未返回音频数据");
  }
}

async function testAsrEngine(config: EngineConfigPatch) {
  const settings = await getSettings();
  const fallback = await getMimoFallback();
  const apiKey =
    config.apiKey ||
    (settings.asrApiKeyEncrypted ? decryptSecret(settings.asrApiKeyEncrypted) : undefined) ||
    (settings.mimoApiKeyEncrypted ? decryptSecret(settings.mimoApiKeyEncrypted) : undefined) ||
    fallback.apiKey;
  if (!apiKey) throw new Error("ASR API Key 未配置");

  const baseURL = stripTrailingSlash(config.baseUrl || settings.asrBaseUrl || fallback.baseURL);
  const model = config.model || settings.asrModel || "mimo-v2.5-asr";
  const url = `${baseURL}/chat/completions`;
  await assertSafeUrl(url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: { data: createSilentWavBase64(), format: "wav" },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(await formatUpstreamError(res, "ASR 测试失败"));
}

async function testSearchEngine(config: EngineConfigPatch) {
  const settings = await getSettings();
  const apiKey =
    config.apiKey ||
    (settings.tavilyApiKeyEncrypted
      ? decryptSecret(settings.tavilyApiKeyEncrypted)
      : undefined);
  if (!apiKey) throw new Error("搜索 API Key 未配置");

  const baseURL = stripTrailingSlash(
    config.baseUrl ||
      settings.searchBaseUrl ||
      process.env.TAVILY_BASE_URL ||
      "https://api.tavily.com"
  );
  const url = `${baseURL}/search`;
  await assertSafeUrl(url);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: "test",
      search_depth: "basic",
      max_results: 1,
    }),
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(await formatUpstreamError(res, "联网搜索测试失败"));
}

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function createSilentWavBase64() {
  const sampleRate = 16_000;
  const durationSeconds = 0.2;
  const samples = Math.floor(sampleRate * durationSeconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer.toString("base64");
}

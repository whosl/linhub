import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { getTtsConfig } from "@/lib/server/engine-config";
import { formatUpstreamError } from "@/lib/server/upstream-error";

export const maxDuration = 120;
const TTS_TIMEOUT_MS = 45_000;

/**
 * MiMo TTS（mimo-v2.5-tts）。
 * 小米 TTS 走 /chat/completions 端点（非 OpenAI 标准 /audio/speech），
 * 认证用 api-key 头（非 Bearer），文本放 assistant 消息，风格指令放 user 消息。
 * 返回 JSON 含 choices[0].message.audio.data（base64），这里解出来透传二进制流。
 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const limited = rateLimit(`voice-tts:${session.user.id}`, 10, 60_000);
  if (limited) return limited;

  const { text } = (await req.json()) as { text?: string };
  if (!text?.trim()) {
    return Response.json({ error: "缺少文本" }, { status: 400 });
  }

  try {
    const { apiKey, baseURL, model, voice } = await getTtsConfig();
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          // user 消息：风格控制（留空 = 默认风格）
          { role: "user", content: "" },
          // assistant 消息：要合成的文本（必须放这里）
          { role: "assistant", content: text.slice(0, 4000) },
        ],
        audio: {
          format: "mp3",
          voice: voice || "冰糖",
        },
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });

    if (!res.ok) {
      return Response.json(
        { error: await formatUpstreamError(res, "TTS 服务不可用") },
        { status: 502 }
      );
    }

    // 响应是 JSON，音频在 choices[0].message.audio.data（base64）
    const data = (await res.json()) as {
      choices?: { message?: { audio?: { data?: string } } }[];
    };
    const audioB64 = data.choices?.[0]?.message?.audio?.data;
    if (!audioB64) {
      return Response.json({ error: "TTS 未返回音频数据" }, { status: 502 });
    }

    // 解 base64 返回二进制流
    const audioBytes = Buffer.from(audioB64, "base64");
    return new Response(audioBytes, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBytes.length),
      },
    });
  } catch (e) {
    return Response.json(
      {
        error: isTimeoutError(e)
          ? "TTS 服务响应超时，请稍后重试"
          : e instanceof Error
            ? e.message
            : "TTS 失败",
      },
      { status: isTimeoutError(e) ? 504 : 500 }
    );
  }
}

function isTimeoutError(e: unknown) {
  if (!e || typeof e !== "object") return false;
  const maybeError = e as { name?: unknown; message?: unknown };
  const name = typeof maybeError.name === "string" ? maybeError.name : "";
  const message = typeof maybeError.message === "string" ? maybeError.message : "";
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    /timeout|aborted/i.test(message)
  );
}

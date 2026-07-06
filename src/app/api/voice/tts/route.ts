import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { getMimoConfig } from "@/lib/server/voice";

export const maxDuration = 120;

/** MiMo TTS：文本合成语音，直接透传音频流（OpenAI 兼容 /audio/speech） */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  // I3: 限频——TTS 代理付费上游，10 次/分/用户
  const limited = rateLimit(`voice-tts:${session.user.id}`, 10, 60_000);
  if (limited) return limited;

  const { text } = (await req.json()) as { text?: string };
  if (!text?.trim()) {
    return Response.json({ error: "缺少文本" }, { status: 400 });
  }

  try {
    const { apiKey, baseURL, voice } = await getMimoConfig();
    const res = await fetch(`${baseURL}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mimo-audio-tts",
        input: text.slice(0, 4000),
        voice,
        response_format: "mp3",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return Response.json(
        { error: `TTS 失败（${res.status}）: ${err.slice(0, 200)}` },
        { status: 502 }
      );
    }
    return new Response(res.body, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "TTS 失败" },
      { status: 500 }
    );
  }
}

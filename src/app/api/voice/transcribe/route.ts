import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { getMimoConfig } from "@/lib/server/voice";

export const maxDuration = 120;

/** MiMo ASR：接收录音，返回转写文字（OpenAI 兼容 /audio/transcriptions） */
export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "缺少音频" }, { status: 400 });
  }

  try {
    const { apiKey, baseURL } = await getMimoConfig();
    const upstream = new FormData();
    upstream.append("file", audio, audio.name || "audio.webm");
    upstream.append("model", "mimo-audio-asr");
    const res = await fetch(`${baseURL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    if (!res.ok) {
      const err = await res.text();
      return Response.json(
        { error: `ASR 失败（${res.status}）: ${err.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { text?: string };
    return Response.json({ text: data.text ?? "" });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "ASR 失败" },
      { status: 500 }
    );
  }
}

import { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { BillingError } from "@/lib/server/billing";
import {
  engineResource,
  withAtomicBilling,
} from "@/lib/server/billing/capabilities";
import { rateLimit } from "@/lib/server/rate-limit";
import { getAsrConfig } from "@/lib/server/engine-config";
import { formatUpstreamError } from "@/lib/server/upstream-error";

export const maxDuration = 120;
const ASR_TIMEOUT_MS = 60_000;

/**
 * MiMo ASR（mimo-v2.5-asr）。
 * 小米 ASR 走 /chat/completions 端点（非 OpenAI 标准 /audio/transcriptions），
 * 认证用 api-key 头。音频转 base64 放 input_audio，
 * 不能包含 text part（网关会注入）。
 * 返回 choices[0].message.content 即转写文本。
 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const limited = rateLimit(`voice-transcribe:${session.user.id}`, 10, 60_000);
  if (limited) return limited;

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "缺少音频" }, { status: 400 });
  }
  if (audio.size > 25 * 1024 * 1024) {
    return Response.json({ error: "音频不能超过 25MB" }, { status: 400 });
  }

  try {
    const text = await withAtomicBilling(
      session.user.id,
      {
        capability: "asr",
        resource: engineResource("asr"),
        units: { requestCount: 1 },
      },
      async () => {
        const { apiKey, baseURL, model } = await getAsrConfig();
        const audioBuffer = Buffer.from(await audio.arrayBuffer());
        const audioB64 = audioBuffer.toString("base64");
        const ext =
          (audio.name || "audio.webm").split(".").pop()?.toLowerCase() ?? "webm";
        const format =
          ext === "wav"
            ? "wav"
            : ext === "mp3" || ext === "mpeg"
              ? "mp3"
              : ext;

        const res = await fetch(`${baseURL}/chat/completions`, {
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
                    input_audio: { data: audioB64, format },
                  },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(ASR_TIMEOUT_MS),
        });

        if (!res.ok) {
          throw new Error(await formatUpstreamError(res, "ASR 服务不可用"));
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        return data.choices?.[0]?.message?.content ?? "";
      }
    );

    return Response.json({ text });
  } catch (e) {
    if (e instanceof BillingError) {
      return Response.json({ error: e.message }, { status: 402 });
    }
    return Response.json(
      {
        error: isTimeoutError(e)
          ? "ASR 服务响应超时，请稍后重试"
          : e instanceof Error
            ? e.message
            : "ASR 失败",
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

// 语音相关端点:语音转写 / 文本朗读(TTS)

import { requestBlob, requestForm } from "./http";

export interface TranscribeResult {
  text: string;
}

/** 语音转文字:POST /api/voice/transcribe(multipart 字段 audio),超时 70s */
export async function transcribeAudio(
  audio: Blob,
  mimeType: string,
): Promise<TranscribeResult> {
  const ext = mimeType.includes("mp4")
    ? "m4a"
    : mimeType.includes("ogg")
      ? "ogg"
      : "webm";
  const formData = new FormData();
  formData.append("audio", audio, `audio.${ext}`);
  return requestForm<TranscribeResult>("/api/voice/transcribe", {
    method: "POST",
    formData,
    timeoutMs: 70_000,
  });
}

/** 文本转语音:POST /api/voice/tts,返回音频二进制,超时 55s */
export async function synthesizeSpeech(text: string): Promise<Blob> {
  return requestBlob("/api/voice/tts", {
    method: "POST",
    body: { text },
    timeoutMs: 55_000,
  });
}
